import { createI18n } from 'vue-i18n';
import { ENGLISH_MESSAGES } from './en';
import { SPANISH_MESSAGES } from './es';
import { DEFAULT_INTERFACE_LANGUAGE } from './language';
import type {
  InterfaceI18n,
  InterfaceLanguage,
  MessageKey,
  MessageSchema,
  MessageValues,
} from './types';

export class MissingMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingMessageError';
  }
}

const CATALOGUES: Record<InterfaceLanguage, Partial<Record<MessageKey, string>>> = {
  es: SPANISH_MESSAGES,
  en: ENGLISH_MESSAGES,
};

const PLACEHOLDER = /\{\w+\}/g;

function checkValues(
  language: InterfaceLanguage,
  key: MessageKey,
  values: MessageValues | undefined,
): void {
  const template = CATALOGUES[language][key];

  // A key with no message at all is `vue-i18n`'s to report, through the
  // `missing` handler below, which says which locale was being read.
  if (template === undefined) {
    return;
  }

  for (const placeholder of template.match(PLACEHOLDER) ?? []) {
    const name = placeholder.slice(1, -1);

    if (values?.[name] === undefined) {
      throw new MissingMessageError(
        `The message "${key}" needs a value for "${placeholder}" and was given none.`,
      );
    }
  }
}

export function createInterfaceI18n(
  locale: InterfaceLanguage = DEFAULT_INTERFACE_LANGUAGE,
): InterfaceI18n {
  return createI18n<{ message: MessageSchema }, InterfaceLanguage, false>({
    legacy: false,

    globalInjection: false,

    locale,

    fallbackLocale: false,

    messages: { es: SPANISH_MESSAGES, en: ENGLISH_MESSAGES },

    messageResolver: (messages, key) =>
      (messages as Record<string, string | undefined>)[key] ?? null,

    missing: (missingLocale, key) => {
      throw new MissingMessageError(`No ${missingLocale} message for "${key}".`);
    },
  });
}

const DETACHED = createInterfaceI18n();

export function translate(
  language: InterfaceLanguage,
  key: MessageKey,
  values?: MessageValues,
): string {
  checkValues(language, key, values);

  return DETACHED.global.t(key, values ?? {}, { locale: language });
}

export function translateWith(
  t: (key: MessageKey, values: MessageValues) => string,
  language: InterfaceLanguage,
  key: MessageKey,
  values?: MessageValues,
): string {
  checkValues(language, key, values);

  return t(key, values ?? {});
}
