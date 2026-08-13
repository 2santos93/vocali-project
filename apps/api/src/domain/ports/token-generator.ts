/**
 * A credential nobody can guess.
 *
 * Separate from `IdGenerator` on purpose, and the separation is not
 * cosmetic. A ULID is designed to be *sortable*, which means it leaks the
 * moment it was minted and its random component is not the whole value; the
 * history query depends on exactly that property. A connection ticket needs
 * the opposite: every bit unpredictable, and no relationship at all between
 * one ticket and the next. Handing out a ULID here would be handing out a
 * credential whose first half is the current time.
 */
export interface TokenGenerator {
  /** URL-safe, so it survives a query string without escaping. */
  generate(): string;
}
