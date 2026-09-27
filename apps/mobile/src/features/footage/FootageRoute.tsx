// The Footage and moment routes: the capture context turned into the screens' actions. Without a capture
// context (the web preview) there is no store, so Footage is empty and a moment cannot be opened.
import type { Uuid } from '@life/contracts';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { listCast } from '../../application/cast';
import { useOptionalCapture, type CaptureContextValue } from '../../application/captureContext';
import {
  deleteMoment,
  editMoment,
  footageByStoryline,
  footageDays,
  footageItem,
  footageStorylines,
} from '../../application/footage';
import { closeOriginal, openOriginal, openPoster } from '../../application/playback';
import { listOpenStorylines } from '../../application/storylines';
import { tagMoment } from '../../application/tagMoment';
import type { EditActions } from './EditTray';
import { DAYS_PER_PAGE, FootageScreen, type FootageActions } from './FootageScreen';
import { MomentViewer, type ViewerActions } from './MomentViewer';

export function footageActions(ctx: CaptureContextValue): FootageActions {
  const { store, documentary } = ctx;
  return {
    loadDays: (beforeDay) =>
      footageDays(store, documentary, { ...(beforeDay ? { beforeDay } : {}), days: DAYS_PER_PAGE }),
    loadStorylines: () => footageStorylines(store, documentary),
    loadStoryline: (id) => footageByStoryline(store, documentary, id),
    poster: async (assetId) => {
      const uri = await openPoster(store, assetId);
      return uri ? { uri } : null;
    },
  };
}

export function viewerActions(ctx: CaptureContextValue): ViewerActions {
  const { store } = ctx;
  return {
    load: (id) => footageItem(store, id),
    openOriginal: (assetId) => openOriginal(store, assetId),
    closeOriginal: (assetId) => closeOriginal(store, assetId),
  };
}

export function editActions(ctx: CaptureContextValue): EditActions {
  const { store, clock, documentary } = ctx;
  return {
    loadTags: async () => ({
      storylines: await listOpenStorylines(store, documentary),
      cast: await listCast(store, documentary),
    }),
    edit: async (id, patch) => {
      await editMoment(store, clock, id, patch);
    },
    tag: async (id, tags) => {
      await tagMoment(store, clock, id, tags);
    },
    remove: (id) => deleteMoment(store, clock, id),
  };
}

const NO_FOOTAGE: FootageActions = {
  loadDays: async () => [],
  loadStorylines: async () => [],
  loadStoryline: async () => [],
  poster: async () => null,
};

const NO_VIEWER: ViewerActions = {
  load: async () => null,
  openOriginal: async () => null,
  closeOriginal: async () => undefined,
};

export function FootageRoute() {
  const ctx = useOptionalCapture();
  const router = useRouter();
  const [actions] = useState(() => (ctx ? footageActions(ctx) : NO_FOOTAGE));
  const [reloadKey, setReloadKey] = useState(0);
  useFocusEffect(useCallback(() => setReloadKey((k) => k + 1), []));
  return (
    <FootageScreen
      actions={actions}
      reloadKey={reloadKey}
      onOpen={(id) => router.push(`/moment/${id}`)}
      onBack={() => router.back()}
    />
  );
}

export function MomentRoute({ id, next = [] }: { id: Uuid; next?: Uuid[] }) {
  const ctx = useOptionalCapture();
  const router = useRouter();
  const [actions] = useState(() => (ctx ? viewerActions(ctx) : NO_VIEWER));
  const [edit] = useState(() => (ctx ? editActions(ctx) : undefined));
  return (
    <MomentViewer
      id={id}
      actions={actions}
      {...(ctx?.Playback ? { Playback: ctx.Playback } : {})}
      {...(edit ? { edit } : {})}
      {...(next.length > 0
        ? {
            onNext: () =>
              router.replace({
                pathname: '/moment/[id]',
                params: { id: next[0]!, next: next.slice(1).join(',') },
              }),
          }
        : {})}
      onClose={() => router.back()}
    />
  );
}
