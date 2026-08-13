import type { InterfaceLanguage } from './types';

/**
 * The **interface** language, never `TranscriptionLanguage` from
 * `@vocali/contracts`, which is the language spoken in a recording. Neither
 * may drive the other: a clinician can dictate in Catalan while reading this
 * application in English.
 *
 * The names are deliberately unabbreviatable, because `Language` on its own is
 * ambiguous in every file that imports both. Nothing here is called `locale`
 * except the tag handed to `Intl`.
 */

/**
 * Spanish first and Spanish stays the default: this is a Spanish medical
 * product, and English is the accommodation.
 */
export const INTERFACE_LANGUAGES = ['es', 'en'] as const;

export const DEFAULT_INTERFACE_LANGUAGE: InterfaceLanguage = 'es';

/**
 * Read by the server on every request, so it is a cookie. The alternative —
 * a prefix on every route — would change every URL in the application, break
 * every link anybody has saved, and make the same screen two addresses.
 */
export const INTERFACE_LANGUAGE_COOKIE = 'vocali_interface_language';

/** A year. A reader's language is not a property of a session. */
export const INTERFACE_LANGUAGE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * `es-ES` and `en-GB` rather than the bare subtags, because these decide how a
 * date and a decimal are written and `en-US` would silently change both. As
 * `lang` it also decides which voice a screen reader uses.
 */
const LOCALE_TAGS: Record<InterfaceLanguage, string> = {
  es: 'es-ES',
  en: 'en-GB',
};

export function localeTag(language: InterfaceLanguage): string {
  return LOCALE_TAGS[language];
}

/**
 * Narrows whatever the cookie holds to a language this application has words
 * for. A cookie is set by whoever has the browser, and an unknown value must
 * fall back to Spanish rather than reach the catalogue and fail to be found.
 */
export function toInterfaceLanguage(value: unknown): InterfaceLanguage | null {
  return INTERFACE_LANGUAGES.find((language) => language === value) ?? null;
}
