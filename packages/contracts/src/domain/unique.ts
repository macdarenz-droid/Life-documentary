/** True when no value appears twice. */
export function isUnique(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length;
}
