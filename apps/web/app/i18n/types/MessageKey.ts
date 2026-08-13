import type { SPANISH_MESSAGES } from '../es';

/**
 * Every message key the interface has words for.
 *
 * Derived rather than declared, so the type and the Spanish catalogue cannot
 * disagree, and every other catalogue is a `Record` over it.
 */
export type MessageKey = keyof typeof SPANISH_MESSAGES;
