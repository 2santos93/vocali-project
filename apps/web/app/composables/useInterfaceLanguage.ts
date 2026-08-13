import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import {
  DEFAULT_INTERFACE_LANGUAGE,
  INTERFACE_LANGUAGE_COOKIE,
  INTERFACE_LANGUAGE_COOKIE_MAX_AGE_SECONDS,
  localeTag,
  toInterfaceLanguage,
} from '../i18n/language';
import type { InterfaceLanguage } from '../i18n/language';

/**
 * The language the interface is written in, kept where the server can read it.
 *
 * A cookie rather than a route prefix. `/en/historial` would double every URL
 * in the application, break links people have saved, and make one screen two
 * addresses for search engines and for support to tell apart — all to express
 * a preference that belongs to the reader rather than to the page. It is also
 * a cookie rather than local storage, for the reason the theme is: the server
 * renders the first paint, and a language it cannot see is a screen rendered
 * in Spanish and rewritten in English once JavaScript catches up.
 *
 * `useState` on top of the cookie so that the toggle in the header, the
 * `lang` attribute on `<html>` and every translated string are reading one
 * value rather than three copies of it.
 *
 * Nothing here has any relationship to the language of a recording. That one
 * is `TranscriptionLanguage`, it is chosen per dictation, and it is sent to
 * the API; this one is never sent anywhere.
 */
export interface InterfaceLanguageControl {
  readonly current: ComputedRef<InterfaceLanguage>;
  /** The BCP 47 tag for `Intl` and for the document's `lang` attribute. */
  readonly locale: ComputedRef<string>;
  choose: (language: InterfaceLanguage) => void;
}

export const INTERFACE_LANGUAGE_STATE_KEY = 'interface.language';

export function useInterfaceLanguage(): InterfaceLanguageControl {
  const cookie = useCookie<string | null>(INTERFACE_LANGUAGE_COOKIE, {
    maxAge: INTERFACE_LANGUAGE_COOKIE_MAX_AGE_SECONDS,
    // Readable by both sides on purpose, and carrying no authority: the worst
    // a forged value can do is show the reader the other catalogue, and
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
