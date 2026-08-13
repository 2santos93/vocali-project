import { createI18n } from 'vue-i18n';
import { ENGLISH_MESSAGES } from './en';
import { SPANISH_MESSAGES } from './es';
import { DEFAULT_INTERFACE_LANGUAGE } from './language';
import type { InterfaceI18n } from './types/InterfaceI18n';
import type { InterfaceLanguage } from './types/InterfaceLanguage';
import type { MessageKey } from './types/MessageKey';
import type { MessageSchema } from './types/MessageSchema';
import type { MessageValues } from './types/MessageValues';

/**
 * `vue-i18n` rather than `@nuxtjs/i18n`: this is a Vue plugin, so components
 * keep mounting under Jest with no Nuxt runtime. The Nuxt module would put its
 * own composables inside components and bring a routing strategy with it.
 */

/**
 * Raised rather than returning something that looks like a message. Both
 * defaults are worse: the key shows `history.column.date` to a clinician, and
 * an empty string shows a column with no heading. Neither leads anybody to the
 * missing entry, and both pass a test suite in silence.
 */
export class MissingMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingMessageError';
  }
}

/*
 * `Partial` is not a weakening: it is what a lookup by a key assembled at run
 * time faces. Both catalogues are complete by construction, but a type
 * promising every lookup succeeds turns the check below into dead code.
 */
const CATALOGUES: Record<InterfaceLanguage, Partial<Record<MessageKey, string>>> = {
  es: SPANISH_MESSAGES,
  en: ENGLISH_MESSAGES,
};

const PLACEHOLDER = /\{\w+\}/g;

/**
 * The one guarantee `vue-i18n` does not offer and cannot be configured into: a
 * named value it was not given becomes an empty string with no warning outside
 * development, so `«{fileName}» está vacío` reaches a user as `«» está vacío`.
 * The likelier of the two mistakes, because a key is checked by the compiler
 * and a value is not.
 */
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

  // Matched whole and unwrapped rather than captured: a capture group hands
  // back `string | undefined` and needs a branch for an absence a `\w+` match
  // cannot produce, which is an untestable line in the middle of the check.
  for (const placeholder of template.match(PLACEHOLDER) ?? []) {
    const name = placeholder.slice(1, -1);

    if (values?.[name] === undefined) {
      throw new MissingMessageError(
        `The message "${key}" needs a value for "${placeholder}" and was given none.`,
      );
    }
  }
}

/**
 * Created per application rather than once for the module: on a server
 * rendering two requests at once, a shared instance is one reader's language
 * deciding what the other reader sees.
 */
export function createInterfaceI18n(
  locale: InterfaceLanguage = DEFAULT_INTERFACE_LANGUAGE,
): InterfaceI18n {
  return createI18n<{ message: MessageSchema }, InterfaceLanguage, false>({
    legacy: false,

    /*
     * No `$t` on every component: `useTranslations` is where the typing, the
     * placeholder check and the `Intl` locale tag live, and a global that
     * skips all three is a second mechanism nobody would notice being used.
     */
    globalInjection: false,

    locale,

    /*
     * A fallback fills a gap in English with the Spanish sentence and reports
     * nothing, so half a screen ends up in the wrong language while looking
     * translated. Measured rather than assumed, this is currently
     * unobservable — the `missing` handler throws first — but it stays as the
     * second line of the same defence: anyone who later softens that handler
     * would otherwise switch a silent fallback back on without noticing.
     */
    fallbackLocale: false,

    messages: { es: SPANISH_MESSAGES, en: ENGLISH_MESSAGES },

    /*
     * The keys are flat identifiers that happen to contain dots, not paths
     * into nested objects: the default resolver would split
     * `history.column.date` into three steps and find nothing.
     */
    messageResolver: (messages, key) =>
      (messages as Record<string, string | undefined>)[key] ?? null,

    missing: (missingLocale, key) => {
      throw new MissingMessageError(`No ${missingLocale} message for "${key}".`);
    },
  });
}

/*
 * One instance for callers that are not components. It carries no state
 * between calls — every translation names its locale — so unlike the
 * application's own instance it is safe to share.
 */
const DETACHED = createInterfaceI18n();

/**
 * `key` is typed against the catalogue, so an unknown one normally cannot be
 * written. It is still checked at run time, because keys are also built from
 * values that crossed a boundary — an authentication failure code, for one.
 */
export function translate(
  language: InterfaceLanguage,
  key: MessageKey,
  values?: MessageValues,
): string {
  checkValues(language, key, values);

  return DETACHED.global.t(key, values ?? {}, { locale: language });
}

/**
 * The same, for a component's own composer, so that rendering tracks the
 * reactive locale the instance holds rather than a copy of it.
 *
 * @internal used by `useTranslations`
 */
export function translateWith(
  t: (key: MessageKey, values: MessageValues) => string,
  language: InterfaceLanguage,
  key: MessageKey,
  values?: MessageValues,
): string {
  checkValues(language, key, values);

  return t(key, values ?? {});
}
