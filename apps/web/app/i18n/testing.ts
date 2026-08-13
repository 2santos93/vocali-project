import type { Plugin } from 'vue';
import { DEFAULT_INTERFACE_LANGUAGE } from './language';
import type { InterfaceLanguage } from './types';
import { createInterfaceI18n } from './translate';

export function withTranslations(language: InterfaceLanguage = DEFAULT_INTERFACE_LANGUAGE): {
  plugins: Plugin[];
} {
  return { plugins: [createInterfaceI18n(language)] };
}
