import { ENGLISH_MESSAGES } from './en';
import { SPANISH_MESSAGES } from './es';
import type { MessageKey } from './es';
import type { InterfaceLanguage } from './language';

/**
 * Turning a key into a sentence, and the two ways that can go wrong.
 *
 * Nothing here knows about Vue, Nuxt or a cookie. It is a pure function of a
 * language, a key and some values, which is what lets the components use it
 * without a runtime and the tests drive both languages without a browser.
 */

export type { MessageKey };

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

/*
 * `Partial` is not a weakening: it is what the lookup below actually faces.
 *
 * Both catalogues are complete by construction — the compiler enforces that —
 * but keys are also assembled at run time from values that crossed a boundary,
 * and a type that promises every lookup succeeds turns the check that catches
 * those into dead code the linter then asks to be deleted.
 */
const CATALOGUES: Record<InterfaceLanguage, Partial<Record<MessageKey, string>>> = {
  es: SPANISH_MESSAGES,
  en: ENGLISH_MESSAGES,
};

/**
 * Raised when a message cannot be produced, rather than returning something
 * that looks like one.
 *
 * The alternative behaviours are worse, and both are the industry default: a
 * library that renders the key shows `history.column.date` to a clinician, and
 * one that renders an empty string shows a column with no heading. Both look
 * like a small visual defect and neither leads anybody to the missing entry.
 * A thrown error names the key and the language, and stops the build's own
 * tests.
 */
export class MissingMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingMessageError';
  }
}

const PLACEHOLDER = /\{(\w+)\}/g;

function fill(template: string, key: MessageKey, values: MessageValues | undefined): string {
  return template.replace(PLACEHOLDER, (_match: string, name: string): string => {
    const value = values?.[name];

    /*
     * An unfilled placeholder is as loud as a missing key, and for the same
     * reason: `«{fileName}» está vacío` is a sentence that reached a user and
     * says nothing. It is also the likelier of the two mistakes, because a key
     * is checked by the compiler and a value is not.
     */
    if (value === undefined) {
      throw new MissingMessageError(
        `The message "${key}" needs a value for "{${name}}" and was given none.`,
      );
    }

    return String(value);
  });
}

/**
 * The message, in the language asked for.
 *
 * `key` is typed as the union of everything the Spanish catalogue defines, so
 * an unknown key normally cannot be written at all. The lookup is still
 * checked, because keys are also built at run time from values that crossed a
 * boundary — an authentication failure code, for one — and that is exactly the
 * path where a silent empty string would ship.
 */
export function translate(
  language: InterfaceLanguage,
  key: MessageKey,
  values?: MessageValues,
): string {
  const template = CATALOGUES[language][key];

  if (template === undefined || template === '') {
    throw new MissingMessageError(`No ${language} message for "${key}".`);
  }

  return fill(template, key, values);
}
