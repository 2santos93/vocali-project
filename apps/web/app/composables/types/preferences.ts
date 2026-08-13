import type { ComputedRef } from 'vue';
import type { ThemePreference } from '../../utils/types/theme';
import type { InterfaceLanguage } from '../../i18n/types';

export interface ThemeControl {
  readonly preference: ComputedRef<ThemePreference>;
  /** What `<html>` carries: `theme-light`, `theme-dark`, or nothing at all. */
  readonly rootClass: ComputedRef<string>;
  readonly isDark: ComputedRef<boolean>;
  choose: (preference: ThemePreference) => void;
}

export interface InterfaceLanguageControl {
  readonly current: ComputedRef<InterfaceLanguage>;
  /** The BCP 47 tag for `Intl` and for the document's `lang` attribute. */
  readonly locale: ComputedRef<string>;
  choose: (language: InterfaceLanguage) => void;
}
