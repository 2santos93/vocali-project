import type { ComputedRef } from 'vue';
import type { InterfaceLanguage } from '../../i18n/types/InterfaceLanguage';

export interface InterfaceLanguageControl {
  readonly current: ComputedRef<InterfaceLanguage>;
  /** The BCP 47 tag for `Intl` and for the document's `lang` attribute. */
  readonly locale: ComputedRef<string>;
  choose: (language: InterfaceLanguage) => void;
}
