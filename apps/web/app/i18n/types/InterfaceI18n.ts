import type { I18n } from 'vue-i18n';
import type { InterfaceLanguage } from './InterfaceLanguage';
import type { MessageSchema } from './MessageSchema';

/**
 * The instance type, spelled out because the package exports a dozen generic
 * parameters and an inferred return type cannot be written in an annotation.
 * It is one locale-keyed record per kind of resource, and `false` for "not the
 * legacy API".
 */
export type InterfaceI18n = I18n<
  Record<InterfaceLanguage, MessageSchema>,
  Record<InterfaceLanguage, Record<string, unknown>>,
  Record<InterfaceLanguage, Record<string, unknown>>,
  string,
  false
>;
