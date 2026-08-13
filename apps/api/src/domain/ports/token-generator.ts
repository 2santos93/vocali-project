export interface TokenGenerator {
  /** URL-safe, so it survives a query string without escaping. */
  generate(): string;
}
