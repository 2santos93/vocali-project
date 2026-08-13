import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { localeTag } from './language';
import type { InterfaceLanguage } from './language';
import { translateWith } from './translate';
import type { MessageKey, MessageSchema, MessageValues, TranslatableMessage } from './translate';

/**
 * How a component reaches the interface language.
 *
 * `vue-i18n`'s own composable underneath, and plain Vue injection all the way
 * down — which is the rule the design system is built on: atoms, molecules and
 * organisms mount under Jest in milliseconds precisely because none of them can
 * reach a Nuxt runtime. `@nuxtjs/i18n` would have put one inside every
 * component that renders a word.
 *
 * A thin facade rather than `useI18n` at each call site, for four reasons that
 * are each a line of code here and fourteen copies of it there: the message
 * schema is named once, so `t` is typed everywhere without a generic argument;
 * a message decided elsewhere (`{ key, values }`) can be rendered as it stands;
 * the placeholder check applies to every call rather than to the ones somebody
 * remembered; and `locale` is the BCP 47 tag `Intl` needs (`es-ES`), not the
 * two letters `vue-i18n` holds.
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

/**
 * The interface language, for a component that renders words.
 *
 * Throws when no instance has been installed. `vue-i18n` throws its own error
 * for this, which names the library rather than the mistake; this one names the
 * two ways to fix it. The tempting third option — falling back to a Spanish
 * catalogue of our own — would mean a plugin that failed to install shows a
 * Spanish interface to somebody who chose English, on every screen, with
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
   * rendered it: switching language redraws the screen already on the display
   * rather than the next one somebody navigates to.
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
