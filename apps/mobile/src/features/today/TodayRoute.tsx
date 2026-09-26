// The Today route: the capture context turned into TodayScreen's props. Without a capture context (the
// web preview) it shows the placeholder.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { captureMoment } from '../../application/captureMoment';
import { useOptionalCapture, type CaptureContextValue } from '../../application/captureContext';
import { todayQuestion } from '../../application/todayQuestion';
import { TodayPlaceholder } from './TodayPlaceholder';
import { TodayScreen, type TodayScreenProps } from './TodayScreen';

/** TodayScreen's props from the capture context. */
export function todayScreenProps(ctx: CaptureContextValue): Omit<TodayScreenProps, 'reloadKey'> {
  const { store, clock, ids, documentary, services, CameraView } = ctx;
  return {
    today: clock.today(documentary.timeZone),
    loadQuestion: () => todayQuestion(store, documentary, clock, ids),
    save: (input) => captureMoment(store, clock, ids, input),
    discard: async (path) => {
      if (await store.io.exists(path)) await store.io.remove(path);
    },
    services,
    CameraView,
  };
}

function ConnectedToday({ ctx }: { ctx: CaptureContextValue }) {
  const [reloadKey, setReloadKey] = useState(0);
  useFocusEffect(useCallback(() => setReloadKey((k) => k + 1), []));
  const [props] = useState(() => todayScreenProps(ctx));
  return <TodayScreen {...props} reloadKey={reloadKey} />;
}

export function TodayRoute() {
  const ctx = useOptionalCapture();
  return ctx ? <ConnectedToday ctx={ctx} /> : <TodayPlaceholder />;
}
