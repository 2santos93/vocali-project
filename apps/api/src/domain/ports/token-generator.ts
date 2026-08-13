/**
 * Separate from `IdGenerator` on purpose: a ULID is sortable, so its first
 * half is the moment it was minted. Handing one out here would be handing out
 * a guessable credential.
 */
export interface TokenGenerator {
  /** URL-safe, so it survives a query string without escaping. */
  generate(): string;
}
