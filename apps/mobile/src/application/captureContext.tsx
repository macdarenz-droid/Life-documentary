// The capture context: the store, clock, ids, the local documentary and the device services. The value
// is built by the composition root in app/; features read it with useCapture().
import type { Documentary } from '@life/contracts';
import { tokens } from '@life/design';
import { words } from '@life/story';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Text } from '../design-system';
import type {
  AppleButtonProps,
  AudioPlaybackProps,
  BackgroundReport,
  CameraViewProps,
  CaptureServices,
  Deadline,
  EpisodePlaybackProps,
  VideoPlaybackProps,
} from '../domain/capturePorts';
import { refreshPushToken } from './account';
import { openLocalDocumentary } from './bootstrap';
import { enqueueExisting } from './enqueueUploads';
import { downloadReady } from './episodes';
import { queueRequestedOriginals } from './originals';
import { clearPlaybackCache } from './playback';
import type { Clock, Ids, Store } from './ports';
import { syncIfSignedIn } from './sync';
import { clearUploadCache, drainUploads } from './uploadQueue';

export type CaptureContextValue = {
  store: Store;
  clock: Clock;
  ids: Ids;
  documentary: Documentary;
  services: CaptureServices;
  /** The camera view for video answers: the Expo one on a device, a fake in tests and the Design Lab. */
  CameraView: ComponentType<CameraViewProps>;
  /** The player views for the moment viewer (P10); absent where nothing can play. */
  Playback?: PlaybackViews;
  /** Apple's sign-in button on iPhone; a fake in tests and the Design Lab. */
  AppleButton?: ComponentType<AppleButtonProps>;
  /** Replaces the documentary every screen reads, after the account link changed its owner id (P4). */
  setDocumentary?: (documentary: Documentary) => void;
  /**
   * Starts a sync round in the background when signed in, then drains the upload queue (P6); it never
   * blocks the screen.
   */
  requestSync?: () => void;
};

/** Video and audio player views: the Expo ones on a device, fakes in tests and the Design Lab. */
export type PlaybackViews = {
  Video: ComponentType<VideoPlaybackProps>;
  Audio: ComponentType<AudioPlaybackProps>;
  Episode: ComponentType<EpisodePlaybackProps>;
};

const CaptureContext = createContext<CaptureContextValue | null>(null);

/** The capture context, or null outside a CaptureRoot (the web preview). */
export function useOptionalCapture(): CaptureContextValue | null {
  return useContext(CaptureContext);
}

/** The capture context; only inside a CaptureRoot that has finished opening. */
export function useCapture(): CaptureContextValue {
  const value = useContext(CaptureContext);
  if (!value) throw new Error('useCapture needs a CaptureRoot above it');
  return value;
}

export type OpenedStore = { store: Store; clock: Clock; ids: Ids; timeZone: string };

type Props = {
  /** Opens the database, runs migrations, loads the master key; injected so tests use the memory store. */
  open: () => Promise<OpenedStore>;
  services: CaptureServices;
  CameraView: ComponentType<CameraViewProps>;
  Playback?: PlaybackViews;
  AppleButton?: ComponentType<AppleButtonProps>;
  /** Opens the screen a tapped notification points to (P16); rendered once the store is open, native only. */
  NotificationTaps?: ComponentType;
  children: ReactNode;
};

/** Opens the store and the local documentary, then renders its children with the capture context. */
export function CaptureRoot({
  open,
  services,
  CameraView,
  Playback,
  AppleButton,
  NotificationTaps,
  children,
}: Props) {
  const [state, setState] = useState<
    { status: 'opening' } | { status: 'ready'; value: CaptureContextValue } | { status: 'failed' }
  >({ status: 'opening' });
  const sync = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { store, clock, ids, timeZone } = await open();
      await clearPlaybackCache(store);
      // Plain copies a killed upload left behind go before any drain or enqueue.
      await clearUploadCache(store);
      const documentary = await openLocalDocumentary(store, clock, ids, timeZone);
      let current = documentary;
      const setDocumentary = (next: Documentary) => {
        current = next;
        setState((state) =>
          state.status === 'ready'
            ? { status: 'ready', value: { ...state.value, documentary: next } }
            : state,
        );
      };
      // Uploads follow a round that worked: the server needs the rows before it takes their files. The
      // originals an episode asked for are queued after every round (P16); a photo's JPEG copy is made
      // only in the foreground.
      const syncAndUpload = async (options: {
        budgetMs?: number;
        retryFailed?: boolean;
        minDrainMs?: number;
        deadline?: Deadline;
        foreground: boolean;
      }): Promise<BackgroundReport> => {
        const report: BackgroundReport = { queued: 0, uploaded: 0 };
        const started = Date.parse(clock.now());
        const outcome = await syncIfSignedIn(store, clock, services.account, services.api, current);
        if (outcome?.status !== 'synced') return report;
        if (outcome.documentary) setDocumentary(outcome.documentary);
        await services.background?.register().catch((error: unknown) => {
          console.error('The background upload task was not registered.', error);
        });
        report.queued = (
          await queueRequestedOriginals(store, clock, services.api, {
            foreground: options.foreground,
            posters: services.posters,
          })
        ).queued;
        // Ready episodes are saved for offline viewing on Wi-Fi, in the foreground only (P16).
        if (options.foreground && services.episodes) {
          await downloadReady(store, current, services.network, services.episodes).catch(
            (error: unknown) => {
              console.error('The episodes were not saved for offline viewing.', error);
            },
          );
        }
        const { budgetMs, retryFailed, minDrainMs, deadline } = options;
        const left =
          budgetMs === undefined
            ? undefined
            : Math.min(
                budgetMs - (Date.parse(clock.now()) - started),
                deadline ? deadline.at - deadline.now() : Infinity,
              );
        if (left !== undefined && (left <= 0 || left < (minDrainMs ?? 0))) return report;
        report.uploaded = (
          await drainUploads(store, clock, services.api, services.network, {
            ...(left !== undefined ? { budgetMs: left } : {}),
            ...(retryFailed ? { retryFailed } : {}),
          })
        ).uploaded;
        return report;
      };
      const run = (options: { retryFailed?: boolean }) => {
        // A silent push can mount the screens with the app in the background: no photo is re-encoded then.
        void syncAndUpload({ ...options, foreground: AppState.currentState === 'active' }).catch(
          (error: unknown) => {
            console.error('The uploads did not run.', error);
          },
        );
      };
      const requestSync = () => run({});
      // Jobs that failed 8 times are tried again only when the app comes to the foreground. The push
      // token goes up at most once a day (P16).
      const onForeground = () => {
        run({ retryFailed: true });
        void refreshPushToken({
          store,
          clock,
          account: services.account,
          api: services.api,
          device: {
            ...services.device,
            newId: () => ids.newId(),
            ...(services.pushTokens ? { pushTokens: services.pushTokens } : {}),
          },
          timeZone: current.timeZone,
        }).catch((error: unknown) => {
          console.error('The push token was not registered.', error);
        });
      };
      // A background run while the screens are up: a photo is re-encoded only if the app is in front.
      services.background?.setRunner((budgetMs, options) =>
        syncAndUpload({
          budgetMs,
          ...(options?.minDrainMs !== undefined ? { minDrainMs: options.minDrainMs } : {}),
          ...(options?.deadline ? { deadline: options.deadline } : {}),
          foreground: AppState.currentState === 'active',
        }),
      );
      if (active) sync.current = onForeground;
      if (active)
        setState({
          status: 'ready',
          value: {
            store,
            clock,
            ids,
            documentary,
            services,
            CameraView,
            ...(Playback ? { Playback } : {}),
            ...(AppleButton ? { AppleButton } : {}),
            setDocumentary,
            requestSync,
          },
        });
      if (!active) return;
      // Captures from before the upload queue are enqueued once, after the screen is up.
      await enqueueExisting(store, clock, services.posters).catch((error: unknown) => {
        console.error('Earlier captures were not enqueued.', error);
      });
      if (active) onForeground();
    })().catch((error: unknown) => {
      console.error('The store could not open.', error);
      if (active) setState({ status: 'failed' });
    });
    return () => {
      active = false;
      sync.current = null;
    };
  }, [open, services, CameraView, Playback, AppleButton]);

  // Every return to the foreground starts a round (the app start is the first one).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync.current?.();
    });
    return () => subscription.remove();
  }, []);

  if (state.status === 'opening') return null;
  if (state.status === 'failed') {
    return (
      <View style={styles.center}>
        <Text variant="body">{words.permissions.openError}</Text>
      </View>
    );
  }
  return (
    <CaptureContext.Provider value={state.value}>
      {NotificationTaps ? <NotificationTaps /> : null}
      {children}
    </CaptureContext.Provider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.space[5],
    backgroundColor: tokens.color.background,
  },
});
