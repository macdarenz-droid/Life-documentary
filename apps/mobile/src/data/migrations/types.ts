/** One step of the append-only schema history. */
export type Migration = { version: number; name: string; sql: string };
