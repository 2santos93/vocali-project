import type { InterfaceLanguage } from './types';

/**
 * Spanish first and Spanish stays the default: this is a Spanish medical
 * product, and English is the accommodation.
 */
export const INTERFACE_LANGUAGES = ['es', 'en'] as const;

export const DEFAULT_INTERFACE_LANGUAGE: InterfaceLanguage = 'es';

export const INTERFACE_LANGUAGE_COOKIE = 'vocali_interface_language';

/** A year. A reader's language is not a property of a session. */
export const INTERFACE_LANGUAGE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const LOCALE_TAGS: Record<InterfaceLanguage, string> = {
  es: 'es-ES',
  en: 'en-GB',
};

export function localeTag(language: InterfaceLanguage): string {
  return LOCALE_TAGS[language];
}

export function toInterfaceLanguage(value: unknown): InterfaceLanguage | null {
  return INTERFACE_LANGUAGES.find((language) => language === value) ?? null;
}
