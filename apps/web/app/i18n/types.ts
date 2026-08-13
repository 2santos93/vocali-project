import type { INTERFACE_LANGUAGES } from './language';
import type { SPANISH_MESSAGES } from './es';
import type { ComputedRef } from 'vue';
import type { I18n } from 'vue-i18n';

/**
 * The language the **interface** is written in.
 *
 * Not to be confused with `TranscriptionLanguage` from `@vocali/contracts`,
 * which is the language spoken in a recording. They are different facts about
 * different things and neither may drive the other: a clinician can dictate a
 * consultation in Catalan while reading this application in English, and a
 * product that ties the two together forces them to choose which of the two
 * truths to break.
 *
 * The name is deliberately unabbreviatable. `Language` on its own would be
 * ambiguous in every file that imports both.
 */
export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];

/**
 * Every message key the interface has words for.
 *
 * Derived rather than declared, so the type and the Spanish catalogue cannot
 * disagree, and every other catalogue is a `Record` over it.
 */
export type MessageKey = keyof typeof SPANISH_MESSAGES;

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

/** What a placeholder is filled with. Numbers are formatted by the caller. */
export type MessageValues = Readonly<Record<string, string | number>>;

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

export interface Translate {
  (key: MessageKey, values?: MessageValues): string;
  (message: TranslatableMessage): string;
}

export interface Translations {
  readonly language: ComputedRef<InterfaceLanguage>;
  /** The BCP 47 tag for `Intl`, so numbers and dates follow the interface. */
  readonly locale: ComputedRef<string>;
  readonly t: Translate;
}

/**
 * The instance type, spelled out because the package exports a dozen generic
 * parameters and an inferred return type cannot be written in an annotation.
 * It is one locale-keyed record per kind of resource, and `false` for "not the
 * legacy API".
 */
export type InterfaceI18n = I18n<
  Record<InterfaceLanguage, MessageSchema>,
  Record<InterfaceLanguage, Record<string, unknown>>,
  Record<InterfaceLanguage, Record<string, unknown>>,
  string,
  false
>;
