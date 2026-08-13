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

export const INTERFACE_LANGUAGE_STATE_KEY = 'interface.language';

export function useInterfaceLanguage(): InterfaceLanguageControl {
  const cookie = useCookie<string | null>(INTERFACE_LANGUAGE_COOKIE, {
    maxAge: INTERFACE_LANGUAGE_COOKIE_MAX_AGE_SECONDS,
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
