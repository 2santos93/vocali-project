import type { INTERFACE_LANGUAGES } from './language';
import type { SPANISH_MESSAGES } from './es';
import type { ComputedRef } from 'vue';
import type { I18n } from 'vue-i18n';

export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];

export type MessageKey = keyof typeof SPANISH_MESSAGES;

export type MessageSchema = Record<MessageKey, string>;

/** What a placeholder is filled with. Numbers are formatted by the caller. */
export type MessageValues = Readonly<Record<string, string | number>>;

export interface TranslatableMessage {
  readonly key: MessageKey;
  readonly values?: MessageValues;
}

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

export type InterfaceI18n = I18n<
  Record<InterfaceLanguage, MessageSchema>,
  Record<InterfaceLanguage, Record<string, unknown>>,
  Record<InterfaceLanguage, Record<string, unknown>>,
  string,
  false
>;
