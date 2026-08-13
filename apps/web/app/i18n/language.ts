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
 * The names are deliberately unabbreviatable. `Language` on its own would be
 * ambiguous in every file that imports both, and a variable called `language`
 * in a component that also holds an audio language is exactly the confusion
 * this comment exists to prevent — so the type is `InterfaceLanguage`, the
 * cookie is `vocali_interface_language`, and nothing here is called `locale`
 * except the tag handed to `Intl`.
 */

/**
 * Spanish first, and Spanish stays the default. This is a Spanish medical
 * product; English is the accommodation, not the baseline.
 */
export const INTERFACE_LANGUAGES = ['es', 'en'] as const;

export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];

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
 * The BCP 47 tag `Intl` is given, and the value of the `lang` attribute.
 *
 * `es-ES` and `en-GB` rather than the bare subtags, because these decide how a
 * date and a decimal are written: a European clinic writes 12/08/2026 and
 * 1,5 MB, and `en-US` would silently turn both into something else on the same
 * screens. `lang` also decides which voice a screen reader uses, which is the
 * difference between "transcripción" being read as a word and as noise.
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
