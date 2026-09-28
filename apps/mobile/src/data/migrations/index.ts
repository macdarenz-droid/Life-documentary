import type { Migration } from './types';
import { v1 } from './v1';
import { v2 } from './v2';
import { v3 } from './v3';
import { v4 } from './v4';
import { v5 } from './v5';
import { v6 } from './v6';

export type { Migration } from './types';
export * from './migrate';

/** Append-only: add v2, v3… at the end; never edit or remove a shipped step. */
export const migrations: readonly Migration[] = [v1, v2, v3, v4, v5, v6];
