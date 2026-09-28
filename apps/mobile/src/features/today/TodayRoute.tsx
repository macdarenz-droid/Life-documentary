// The Today route: the capture context turned into TodayScreen's props. Without a capture context (the
// web preview) it shows the placeholder.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { addCastMember, listCast } from '../../application/cast';
import { captureMoment } from '../../application/captureMoment';
import { enqueueUploads } from '../../application/enqueueUploads';
import {
  acceptReminderOffer,
  dismissReminderOffer,
  shouldOfferReminder,
} from '../../application/reminders';
import { useOptionalCapture, type CaptureContextValue } from '../../application/captureContext';
import { thisWeek, weekLine } from '../../application/episodes';
import { oneYearAgo } from '../../application/footage';
import { openPoster } from '../../application/playback';
import { ensurePoster } from '../../application/posters';
import { createStoryline, listOpenStorylines } from '../../application/storylines';
import { tagMoment } from '../../application/tagMoment';
import { todayQuestion } from '../../application/todayQuestion';
import { TodayPlaceholder } from './TodayPlaceholder';
import { TodayScreen, type TodayScreenProps } from './TodayScreen';

/** TodayScreen's props from the capture context. */
export function todayScreenProps(ctx: CaptureContextValue): Omit<TodayScreenProps, 'reloadKey'> {
  const { store, clock, ids, documentary, services, CameraView } = ctx;
  return {
    loadQuestion: () => todayQuestion(store, documentary, clock, ids),
    save: async (input) => {
      const moment = await captureMoment(store, clock, ids, input);
      // A photo's preview is made here; like the poster, it never fails the capture.
      await enqueueUploads(store, clock, services.posters, moment.id).catch(() => null);
      ctx.requestSync?.();
      // The poster is extra: a capture never fails because of it.
      if (moment.mediaAssetId) {
        await ensurePoster(store, services.posters, moment.mediaAssetId).catch(() => false);
      }
      return moment;
    },
    discard: async (path) => {
      if (await store.io.exists(path)) await store.io.remove(path);
    },
    services,
    CameraView,
    reminderOffer: {
      shouldOffer: () => shouldOfferReminder(store, services.reminders, documentary),
      accept: () => acceptReminderOffer(store, services.reminders),
      dismiss: () => dismissReminderOffer(store),
    },
    oneYearAgo: {
      load: () => oneYearAgo(store, documentary, clock.today(documentary.timeZone)),
      poster: async (assetId) => {
        const uri = await openPoster(store, assetId);
        return uri ? { uri } : null;
      },
    },
    episodeLine: {
      load: async () => weekLine(await thisWeek(store, clock, documentary)),
    },
    tags: {
      load: async () => ({
        storylines: await listOpenStorylines(store, documentary),
        cast: await listCast(store, documentary),
      }),
      createStoryline: (title) => createStoryline(store, clock, ids, documentary, title),
      addCastMember: (name) => addCastMember(store, clock, ids, documentary, name),
      tag: async (momentId, tags) => {
        await tagMoment(store, clock, momentId, tags);
        ctx.requestSync?.();
      },
    },
  };
}

function ConnectedToday({ ctx }: { ctx: CaptureContextValue }) {
  const [reloadKey, setReloadKey] = useState(0);
  useFocusEffect(useCallback(() => setReloadKey((k) => k + 1), []));
  const [props] = useState(() => todayScreenProps(ctx));
  const router = useRouter();
  return (
    <TodayScreen
      {...props}
      reloadKey={reloadKey}
      onNavigate={(to) => router.push(`/${to}`)}
      onOpenEpisodes={() => router.push('/episodes')}
      onOpenMoments={([id, ...rest]) =>
        router.push({ pathname: '/moment/[id]', params: { id: id!, next: rest.join(',') } })
      }
    />
  );
}

export function TodayRoute() {
  const ctx = useOptionalCapture();
  return ctx ? <ConnectedToday ctx={ctx} /> : <TodayPlaceholder />;
}
