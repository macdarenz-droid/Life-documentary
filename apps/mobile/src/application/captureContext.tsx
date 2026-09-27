// The capture context: the store, clock, ids, the local documentary and the device services. The value
// is built by the composition root in app/; features read it with useCapture().
import type { Documentary } from '@life/contracts';
import { tokens } from '@life/design';
import { words } from '@life/story';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../design-system';
import type { CameraViewProps, CaptureServices } from '../domain/capturePorts';
import { openLocalDocumentary } from './bootstrap';
import { clearPlaybackCache } from './playback';
import type { Clock, Ids, Store } from './ports';

export type CaptureContextValue = {
  store: Store;
  clock: Clock;
  ids: Ids;
  documentary: Documentary;
  services: CaptureServices;
  /** The camera view for video answers: the Expo one on a device, a fake in tests and the Design Lab. */
  CameraView: ComponentType<CameraViewProps>;
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
  children: ReactNode;
};

/** Opens the store and the local documentary, then renders its children with the capture context. */
export function CaptureRoot({ open, services, CameraView, children }: Props) {
  const [state, setState] = useState<
    { status: 'opening' } | { status: 'ready'; value: CaptureContextValue } | { status: 'failed' }
  >({ status: 'opening' });

  useEffect(() => {
    let active = true;
    (async () => {
      const { store, clock, ids, timeZone } = await open();
      await clearPlaybackCache(store);
      const documentary = await openLocalDocumentary(store, clock, ids, timeZone);
      if (active)
        setState({
          status: 'ready',
          value: { store, clock, ids, documentary, services, CameraView },
        });
    })().catch((error: unknown) => {
      console.error('The store could not open.', error);
      if (active) setState({ status: 'failed' });
    });
    return () => {
      active = false;
    };
  }, [open, services, CameraView]);

  if (state.status === 'opening') return null;
  if (state.status === 'failed') {
    return (
      <View style={styles.center}>
        <Text variant="body">{words.permissions.openError}</Text>
      </View>
    );
  }
  return <CaptureContext.Provider value={state.value}>{children}</CaptureContext.Provider>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.space[5],
    backgroundColor: tokens.color.background,
  },
});
