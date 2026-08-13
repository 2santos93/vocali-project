import type { Ref } from 'vue';

/**
 * No token here and nowhere one could be put: the session lives in httpOnly
 * cookies the server sets and script cannot read.
 */
export interface AuthenticatedUser {
  readonly email: string;
  readonly subject: string;
}

export interface AuthSession {
  readonly user: Readonly<Ref<AuthenticatedUser | null>>;
  ensureLoaded(): Promise<void>;
  refresh(): Promise<void>;
  adopt(user: AuthenticatedUser): void;
  signOut(): Promise<void>;
}
