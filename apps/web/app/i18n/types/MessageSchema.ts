import type { MessageKey } from './MessageKey';

/**
 * The shape every catalogue has to have.
 *
 * Deliberately `Record<MessageKey, string>` and not `typeof SPANISH_MESSAGES`:
 * the Spanish catalogue is `as const`, so its own type says every message is
 * one specific sentence, and no translation could ever satisfy it. Widened to
 * `string`, it still carries the exact key set — which is the part that has to
 * hold. `createI18n` is given this as its message schema, so a locale missing a
 * key, or carrying one nobody declared, fails `pnpm typecheck`.
 */
export type MessageSchema = Record<MessageKey, string>;
