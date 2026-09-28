// The Episodes and episode routes: the capture context turned into the screens' actions. Without a
// capture context (the web preview) there are no episodes. Both screens fade in, or appear at once with
// reduced motion.
import type { Uuid } from '@life/contracts';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useOptionalCapture, type CaptureContextValue } from '../../application/captureContext';
import {
  closeEpisode,
  getEpisode,
  listEpisodes,
  openEpisode,
  thisWeek,
} from '../../application/episodes';
import { useMotionPreference } from '../../design-system/motionPreference';
import { EpisodeScreen, type EpisodeActions } from './EpisodeScreen';
import { EpisodesScreen, type EpisodesActions } from './EpisodesScreen';

export function episodesActions(ctx: CaptureContextValue): EpisodesActions {
  const { store, clock, documentary } = ctx;
  return {
    load: async () => ({
      week: await thisWeek(store, clock, documentary),
      episodes: await listEpisodes(store, clock, documentary),
    }),
  };
}

export function episodeActions(ctx: CaptureContextValue): EpisodeActions {
  const { store, services } = ctx;
  return {
    load: (id) => getEpisode(store, id),
    open: (episode) => openEpisode(store, services.episodes, episode),
    close: (id) => closeEpisode(store, id),
  };
}

const NO_EPISODES: EpisodesActions = {
  load: async () => ({ week: { status: 'none', hour: 18 }, episodes: [] }),
};

const NO_EPISODE: EpisodeActions = {
  load: async () => null,
  open: async () => null,
  close: async () => undefined,
};

function Transition() {
  const { reduced } = useMotionPreference();
  return <Stack.Screen options={{ animation: reduced ? 'none' : 'fade' }} />;
}

export function EpisodesRoute() {
  const ctx = useOptionalCapture();
  const router = useRouter();
  const [actions] = useState(() => (ctx ? episodesActions(ctx) : NO_EPISODES));
  const [reloadKey, setReloadKey] = useState(0);
  useFocusEffect(useCallback(() => setReloadKey((k) => k + 1), []));
  return (
    <>
      <Transition />
      <EpisodesScreen
        actions={actions}
        reloadKey={reloadKey}
        onOpen={(id) => router.push(`/episode/${id}`)}
        onBack={() => router.back()}
      />
    </>
  );
}

export function EpisodeRoute({ id }: { id: Uuid }) {
  const ctx = useOptionalCapture();
  const router = useRouter();
  const [actions] = useState(() => (ctx ? episodeActions(ctx) : NO_EPISODE));
  return (
    <>
      <Transition />
      <EpisodeScreen
        id={id}
        actions={actions}
        {...(ctx?.Playback ? { Playback: ctx.Playback } : {})}
        onClose={() => router.back()}
      />
    </>
  );
}
