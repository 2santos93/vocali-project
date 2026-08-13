import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { localeTag } from './language';
import { translateWith } from './translate';
import type {
  InterfaceLanguage,
  MessageKey,
  MessageSchema,
  MessageValues,
  TranslatableMessage,
  Translations,
} from './types';

/**
 * Plain Vue injection all the way down, which is the rule the design system is
 * built on: components mount under Jest because none of them can reach a Nuxt
 * runtime. `@nuxtjs/i18n` would have put one inside every component that
 * renders a word.
 *
 * A facade rather than `useI18n` at each call site, for four things that are a
 * line here and fourteen copies there: the schema is named once so `t` is
 * typed without a generic argument; a `{ key, values }` decided elsewhere
 * renders as it stands; the placeholder check applies to every call rather
 * than the ones somebody remembered; and `locale` is the BCP 47 tag `Intl`
 * needs, not the two letters `vue-i18n` holds.
 */

/**
 * Throws when no instance has been installed, naming the two ways to fix it.
 * The tempting alternative — falling back to a Spanish catalogue of our own —
 * would show Spanish to somebody who chose English, on every screen, with
 * nothing anywhere reporting it.
 */
type InterfaceComposer = ReturnType<typeof useI18n<{ message: MessageSchema }, InterfaceLanguage>>;

function installedComposer(): InterfaceComposer {
  try {
    return useI18n<{ message: MessageSchema }, InterfaceLanguage>();
  } catch (cause) {
    throw new Error(
      'No interface translations were provided. Install the i18n plugin, or mount this component with withTranslations().',
      { cause },
    );
  }
}

export function useTranslations(): Translations {
  const composer = installedComposer();

  const language = computed<InterfaceLanguage>(() => composer.locale.value);

  /*
   * Reads the locale on every call, so it is a reactive dependency of whatever
   * rendered it: switching language redraws the screen already on display.
   */
  function t(input: MessageKey | TranslatableMessage, values?: MessageValues): string {
    const render = (key: MessageKey, named: MessageValues): string => composer.t(key, named);

    return typeof input === 'string'
      ? translateWith(render, language.value, input, values)
      : translateWith(render, language.value, input.key, input.values);
  }

  return {
    language,
    locale: computed<string>(() => localeTag(language.value)),
    t,
  };
}
