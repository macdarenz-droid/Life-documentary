// The Cast route: the capture context turned into the screen's actions. Without a capture context (the
// web preview) there is no store, so the screen shows its empty list.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  addCastMember,
  listCast,
  removeCastMember,
  renameCastMember,
  setRelation,
} from '../../application/cast';
import { useOptionalCapture, type CaptureContextValue } from '../../application/captureContext';
import { CastScreen, type CastActions } from './CastScreen';

export function castActions(ctx: CaptureContextValue): CastActions {
  const { store, clock, ids, documentary } = ctx;
  return {
    load: () => listCast(store, documentary),
    add: (name, relation) => addCastMember(store, clock, ids, documentary, name, relation),
    rename: (id, name) => renameCastMember(store, clock, id, name),
    setRelation: (id, relation) => setRelation(store, clock, id, relation),
    remove: (id) => removeCastMember(store, clock, id),
  };
}

const NO_STORE: CastActions = {
  load: async () => [],
  add: async () => undefined,
  rename: async () => undefined,
  setRelation: async () => undefined,
  remove: async () => undefined,
};

export function CastRoute() {
  const ctx = useOptionalCapture();
  const router = useRouter();
  const [actions] = useState(() => (ctx ? castActions(ctx) : NO_STORE));
  return <CastScreen actions={actions} onBack={() => router.back()} />;
}
