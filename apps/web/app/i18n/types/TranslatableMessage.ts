import type { MessageKey } from './MessageKey';
import type { MessageValues } from './MessageValues';

/**
 * A message that has been decided but not yet worded.
 *
 * Failures travel as one of these rather than as prose. A composable knows
 * *which* thing went wrong; the language it should be said in belongs to
 * whoever is reading, and is not settled until the moment it is rendered — so
 * a failure raised in Spanish still reads correctly after the reader switches
 * to English.
 */
export interface TranslatableMessage {
  readonly key: MessageKey;
  readonly values?: MessageValues;
}
