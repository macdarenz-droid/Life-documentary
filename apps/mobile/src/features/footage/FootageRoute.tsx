// The Footage and moment routes: the capture context turned into the screens' actions. Without a capture
// context (the web preview) there is no store, so Footage is empty and a moment cannot be opened.
import type { Uuid } from '@life/contracts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useOptionalCapture, type CaptureContextValue } from '../../application/captureContext';
import {
  footageByStoryline,
  footageDays,
  footageItem,
  footageStorylines,
} from '../../application/footage';
import { closeOriginal, openOriginal, openPoster } from '../../application/playback';
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
  return (
    <FootageScreen
      actions={actions}
      onOpen={(id) => router.push(`/moment/${id}`)}
      onBack={() => router.back()}
    />
  );
}

export function MomentRoute({ id }: { id: Uuid }) {
  const ctx = useOptionalCapture();
  const router = useRouter();
  const [actions] = useState(() => (ctx ? viewerActions(ctx) : NO_VIEWER));
  return (
    <MomentViewer
      id={id}
      actions={actions}
      {...(ctx?.Playback ? { Playback: ctx.Playback } : {})}
      onClose={() => router.back()}
    />
  );
}
