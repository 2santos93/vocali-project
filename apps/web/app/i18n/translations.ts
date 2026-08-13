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
