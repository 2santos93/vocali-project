import type { Ref } from 'vue';
import type { AuthenticatedUser } from './AuthenticatedUser';

export interface AuthSession {
  readonly user: Readonly<Ref<AuthenticatedUser | null>>;
  ensureLoaded(): Promise<void>;
  refresh(): Promise<void>;
  adopt(user: AuthenticatedUser): void;
  signOut(): Promise<void>;
}
