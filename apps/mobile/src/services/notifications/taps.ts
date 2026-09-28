// Opening an episode from a tapped push (P16, D42). A cold start reads the last response; a running app
// hears the listener. It navigates only once the root navigation is ready, then clears the response.
// Only a `data.episodeId` that is a UUID opens anything.
import { Uuid } from '@life/contracts';
import { useRootNavigationState, useRouter } from 'expo-router';
import {
  addNotificationResponseReceivedListener,
  clearLastNotificationResponse,
  getLastNotificationResponse,
  type NotificationResponse,
} from 'expo-notifications';
import { createElement, Fragment, useEffect, useRef, useState } from 'react';

type Tap = { key: string; episodeId: Uuid };

function readData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const record = data as Record<string, unknown>;
  // Some Android payloads carry the data as a JSON string (UNVERIFIED on a real device).
  if (typeof record.dataString === 'string') {
    try {
      const parsed: unknown = JSON.parse(record.dataString);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return record;
    }
  }
  return record;
}

function tapOf(response: NotificationResponse | null): Tap | null {
  if (!response) return null;
  const { request } = response.notification;
  const episodeId = Uuid.safeParse(readData(request.content.data).episodeId);
  return episodeId.success ? { key: request.identifier, episodeId: episodeId.data } : null;
}

/** Calls `open` with the episode id of a tapped push, once the root navigation is ready. */
export function useEpisodeTaps(open: (episodeId: Uuid) => void): void {
  const ready = useRootNavigationState()?.key !== undefined;
  const [pending, setPending] = useState<Tap | null>(null);
  const handled = useRef(new Set<string>());
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const take = (response: NotificationResponse | null) => {
      const tap = tapOf(response);
      if (tap && !handled.current.has(tap.key)) setPending(tap);
    };
    take(getLastNotificationResponse());
    const subscription = addNotificationResponseReceivedListener(take);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!ready || !pending || handled.current.has(pending.key)) return;
    handled.current.add(pending.key);
    openRef.current(pending.episodeId);
    clearLastNotificationResponse();
    setPending(null);
  }, [ready, pending]);
}

/** Mounted by the capture root on native: opens `/episode/{id}` for a tapped episode push. */
export function EpisodeTaps() {
  const router = useRouter();
  useEpisodeTaps((episodeId) => router.push(`/episode/${episodeId}`));
  return createElement(Fragment);
}
