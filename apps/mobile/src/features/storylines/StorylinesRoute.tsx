// The Storylines route: the capture context turned into the screen's actions. Without a capture context
// (the web preview) there is no store, so the screen shows its empty list.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useOptionalCapture, type CaptureContextValue } from '../../application/captureContext';
import {
  closeStoryline,
  createStoryline,
  listStorylineSummaries,
  removeStoryline,
  renameStoryline,
  reopenStoryline,
} from '../../application/storylines';
import { StorylinesScreen, type StorylineActions } from './StorylinesScreen';

export function storylineActions(ctx: CaptureContextValue): StorylineActions {
  const { store, clock, ids, documentary } = ctx;
  return {
    load: () => listStorylineSummaries(store, documentary),
    create: (title) => createStoryline(store, clock, ids, documentary, title),
    rename: (id, title) => renameStoryline(store, clock, id, title),
    close: (id) => closeStoryline(store, clock, id),
    reopen: (id) => reopenStoryline(store, clock, id),
    remove: (id) => removeStoryline(store, clock, id),
  };
}

const NO_STORE: StorylineActions = {
  load: async () => [],
  create: async () => undefined,
  rename: async () => undefined,
  close: async () => undefined,
  reopen: async () => undefined,
  remove: async () => undefined,
};

export function StorylinesRoute() {
  const ctx = useOptionalCapture();
  const router = useRouter();
  const [actions] = useState(() => (ctx ? storylineActions(ctx) : NO_STORE));
  return <StorylinesScreen actions={actions} onBack={() => router.back()} />;
}
