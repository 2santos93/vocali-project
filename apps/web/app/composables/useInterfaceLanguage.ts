import { computed } from 'vue';
import {
  DEFAULT_INTERFACE_LANGUAGE,
  INTERFACE_LANGUAGE_COOKIE,
  INTERFACE_LANGUAGE_COOKIE_MAX_AGE_SECONDS,
  localeTag,
  toInterfaceLanguage,
} from '../i18n/language';
import type { InterfaceLanguage } from '../i18n/types';
import type { InterfaceLanguageControl } from './types/preferences';

/**
 * A cookie rather than a route prefix — `/en/historial` doubles every URL and
 * makes one screen two addresses — and rather than local storage, because the
 * server renders the first paint and a language it cannot see is a screen
 * rendered in Spanish and rewritten in English once JavaScript catches up.
 *
 * `useState` on top of it so the header toggle, the `lang` attribute and every
 * translated string read one value rather than three copies.
 *
 * Nothing here relates to the language of a recording. That is
 * `TranscriptionLanguage`, chosen per dictation and sent to the API; this one
 * is never sent anywhere.
 */

export const INTERFACE_LANGUAGE_STATE_KEY = 'interface.language';

export function useInterfaceLanguage(): InterfaceLanguageControl {
  const cookie = useCookie<string | null>(INTERFACE_LANGUAGE_COOKIE, {
    maxAge: INTERFACE_LANGUAGE_COOKIE_MAX_AGE_SECONDS,
    // Readable by both sides on purpose and carrying no authority: the worst a
    // forged value does is show the other catalogue, and
    // `toInterfaceLanguage` refuses anything that is not one of the two.
    sameSite: 'lax',
    secure: true,
    path: '/',
  });

  const chosen = useState<InterfaceLanguage>(
    INTERFACE_LANGUAGE_STATE_KEY,
    () => toInterfaceLanguage(cookie.value) ?? DEFAULT_INTERFACE_LANGUAGE,
  );

  function choose(language: InterfaceLanguage): void {
    chosen.value = language;
    cookie.value = language;
  }

  return {
    current: computed<InterfaceLanguage>(() => chosen.value),
    locale: computed<string>(() => localeTag(chosen.value)),
    choose,
  };
}
