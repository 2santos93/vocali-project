/**
 * No token here and nowhere one could be put: the session lives in httpOnly
 * cookies the server sets and script cannot read.
 */
export interface AuthenticatedUser {
  readonly email: string;
  readonly subject: string;
}
