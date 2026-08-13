import type { ComputedRef } from 'vue';
import type { InterfaceLanguage } from './InterfaceLanguage';
import type { Translate } from './Translate';

export interface Translations {
  readonly language: ComputedRef<InterfaceLanguage>;
  /** The BCP 47 tag for `Intl`, so numbers and dates follow the interface. */
  readonly locale: ComputedRef<string>;
  readonly t: Translate;
}
