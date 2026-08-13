import { computed, inject } from 'vue';
import type { ComputedRef, InjectionKey, Ref } from 'vue';
import { localeTag } from './language';
import type { InterfaceLanguage } from './language';
import { translate } from './translate';
import type { MessageKey, MessageValues, TranslatableMessage } from './translate';

/**
 * How a component reaches the interface language.
 *
 * Plain Vue `provide`/`inject`, and not a Nuxt composable, because that is the
 * rule the design system is built on: atoms, molecules and organisms mount
 * under Jest in milliseconds precisely because none of them can reach a Nuxt
 * runtime. A `useCookie` inside a component would fail the type check, fail
 * the lint, and — worse than either — make the components untestable without
 * booting a framework.
 *
 * Passing every string down as a prop was the alternative. It works for an
 * atom with one label and collapses at the history table, which would need
 * twenty of them; and a prop that is only ever threaded through unchanged
 * stops being an interface and becomes noise.
 *
 * `t` reads the language ref on every call, so it is a reactive dependency of
 * whatever rendered it: switching language re-renders the screen rather than
 * needing a reload.
 */

export interface Translate {
  (key: MessageKey, values?: MessageValues): string;
  (message: TranslatableMessage): string;
}

export interface Translations {
  readonly language: ComputedRef<InterfaceLanguage>;
  /** The BCP 47 tag for `Intl`, so numbers and dates follow the interface. */
  readonly locale: ComputedRef<string>;
  readonly t: Translate;
}

export const TRANSLATIONS: InjectionKey<Translations> = Symbol('vocali.translations');

export function createTranslations(
  language: Ref<InterfaceLanguage> | ComputedRef<InterfaceLanguage>,
): Translations {
  function t(input: MessageKey | TranslatableMessage, values?: MessageValues): string {
    return typeof input === 'string'
      ? translate(language.value, input, values)
      : translate(language.value, input.key, input.values);
  }

  return {
    language: computed<InterfaceLanguage>(() => language.value),
    locale: computed<string>(() => localeTag(language.value)),
    t,
  };
}

/**
 * The interface language, for a component that renders words.
 *
 * Throws when nothing has provided it. The tempting alternative — falling back
 * to the Spanish catalogue — would mean a plugin that failed to install shows
 * a Spanish interface to somebody who chose English, on every screen, with
 * nothing anywhere reporting it. A component that renders text and cannot say
 * which language it is in is broken, and should say so where it breaks.
 */
export function useTranslations(): Translations {
  const translations = inject(TRANSLATIONS, null);

  if (translations === null) {
    throw new Error(
      'No interface translations were provided. Install the i18n plugin, or provide TRANSLATIONS when mounting this component.',
    );
  }

  return translations;
}
