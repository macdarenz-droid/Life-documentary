/** A stored row that no longer matches its contract. Never skipped silently. */
export class CorruptRowError extends Error {
  override name = 'CorruptRowError';
  constructor(
    readonly table: string,
    readonly id: string,
    detail: string,
  ) {
    super(`Row ${id} in ${table} does not match its contract: ${detail}`);
  }
}

/** A write that collides with a uniqueness rule, such as a second question for the same day. */
export class ConflictError extends Error {
  override name = 'ConflictError';
}
