import type { Migration } from './types';
import { v1 } from './v1';

export type { Migration } from './types';
export * from './migrate';

/** Append-only: add v2, v3… at the end; never edit or remove a shipped step. */
export const migrations: readonly Migration[] = [v1];
