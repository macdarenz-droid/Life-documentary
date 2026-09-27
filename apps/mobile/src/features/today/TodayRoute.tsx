// The Today route: the capture context turned into TodayScreen's props. Without a capture context (the
// web preview) it shows the placeholder.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { addCastMember, listCast } from '../../application/cast';
import { captureMoment } from '../../application/captureMoment';
import {
  acceptReminderOffer,
  dismissReminderOffer,
  shouldOfferReminder,
} from '../../application/reminders';
import { useOptionalCapture, type CaptureContextValue } from '../../application/captureContext';
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
    save: (input) => captureMoment(store, clock, ids, input),
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
    tags: {
      load: async () => ({
        storylines: await listOpenStorylines(store, documentary),
        cast: await listCast(store, documentary),
      }),
      createStoryline: (title) => createStoryline(store, clock, ids, documentary, title),
      addCastMember: (name) => addCastMember(store, clock, ids, documentary, name),
      tag: async (momentId, tags) => {
        await tagMoment(store, clock, momentId, tags);
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
    <TodayScreen {...props} reloadKey={reloadKey} onNavigate={(to) => router.push(`/${to}`)} />
  );
}

export function TodayRoute() {
  const ctx = useOptionalCapture();
  return ctx ? <ConnectedToday ctx={ctx} /> : <TodayPlaceholder />;
}
