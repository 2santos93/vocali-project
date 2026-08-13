import { createI18n } from 'vue-i18n';
import type { I18n } from 'vue-i18n';
import { ENGLISH_MESSAGES } from './en';
import { SPANISH_MESSAGES } from './es';
import type { MessageKey } from './es';
import { DEFAULT_INTERFACE_LANGUAGE } from './language';
import type { InterfaceLanguage } from './language';

/**
 * The `vue-i18n` instance this application speaks through, and the two
 * guarantees layered on top of it.
 *
 * `vue-i18n` rather than `@nuxtjs/i18n`: this is a Vue plugin, so the design
 * system keeps mounting under Jest with no Nuxt runtime and the architectural
 * rule survives untouched. The Nuxt module would put its own composables inside
 * components and bring a routing strategy with it, and the URLs must not
 * change.
 */

export type { MessageKey };

/** What a placeholder is filled with. Numbers are formatted by the caller. */
export type MessageValues = Readonly<Record<string, string | number>>;

/**
 * A message that has been decided but not yet worded.
 *
 * Failures travel as one of these rather than as prose. A composable knows
 * *which* thing went wrong; the language it should be said in belongs to
 * whoever is reading, and is not settled until the moment it is rendered — so
 * a failure raised in Spanish still reads correctly after the reader switches
 * to English.
 */
export interface TranslatableMessage {
  readonly key: MessageKey;
  readonly values?: MessageValues;
}

/**
 * The shape every catalogue has to have.
 *
 * Deliberately `Record<MessageKey, string>` and not `typeof SPANISH_MESSAGES`:
 * the Spanish catalogue is `as const`, so its own type says every message is
 * one specific sentence, and no translation could ever satisfy it. Widened to
 * `string`, it still carries the exact key set — which is the part that has to
 * hold. `createI18n` is given this as its message schema, so a locale missing a
 * key, or carrying one nobody declared, fails `pnpm typecheck` at the call
 * below.
 */
export type MessageSchema = Record<MessageKey, string>;

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

/**
 * Raised when a message cannot be produced, rather than returning something
 * that looks like one.
 *
 * The alternatives are worse, and both are what a translation library does
 * left to itself: rendering the key shows `history.column.date` to a clinician,
 * and rendering an empty string shows a column with no heading. Both look like
 * a small visual defect, neither leads anybody to the missing entry, and both
 * would pass a test suite in silence.
 */
export class MissingMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingMessageError';
  }
}

/*
 * The catalogues, keyed by locale.
 *
 * `Partial` is not a weakening: it is what a lookup by a key assembled at run
 * time actually faces. Both catalogues are complete by construction — the
 * schema above enforces that — but a type promising every lookup succeeds turns
 * the check that catches the others into dead code.
 */
const CATALOGUES: Record<InterfaceLanguage, Partial<Record<MessageKey, string>>> = {
  es: SPANISH_MESSAGES,
  en: ENGLISH_MESSAGES,
};

const PLACEHOLDER = /\{\w+\}/g;

/**
 * Refuses to render a message whose placeholders have nothing to fill them.
 *
 * This is the one guarantee `vue-i18n` does not offer and cannot be configured
 * into: a named value it was not given is substituted with an empty string,
 * with no warning outside development. `«{fileName}» está vacío` then reaches a
 * user as `«» está vacío`, which is a sentence that says nothing about the file
 * it is refusing — and it is the likelier of the two mistakes, because a key is
 * checked by the compiler and a value is not.
 *
 * It reads the same two catalogue objects the instance was built from, so the
 * check and the render can never disagree about what a message says.
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

  // Matched whole and unwrapped, rather than captured: a capture group would
  // hand back `string | undefined` and need a branch for an absence that a
  // `\w+` match cannot produce — an untestable line in the middle of the check.
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
 * A `vue-i18n` instance for one Vue application.
 *
 * Created per application rather than once for the module. On a server
 * rendering two requests at the same time, a shared instance is one reader's
 * language deciding what the other reader sees — the same reason the session
 * lives in `useState` rather than in a module-level ref.
 */
export function createInterfaceI18n(
  locale: InterfaceLanguage = DEFAULT_INTERFACE_LANGUAGE,
): InterfaceI18n {
  return createI18n<{ message: MessageSchema }, InterfaceLanguage, false>({
    legacy: false,

    /*
     * No `$t` on every component. One way to reach the catalogue, through
     * `useTranslations`, which is where the typing, the placeholder check and
     * the `Intl` locale tag live; a global that skips all three is a second
     * mechanism nobody would notice being used.
     */
    globalInjection: false,

    locale,

    /*
     * No fallback locale, deliberately — and, measured rather than assumed,
     * currently unobservable.
     *
     * A fallback fills a gap in English with the Spanish sentence and reports
     * nothing, so half a screen ends up in the wrong language while looking
     * translated. That is the behaviour being refused. But `vue-i18n` consults
     * the `missing` handler for each locale it tries, in order, so the throw
     * below happens before any fallback is reached: setting this to `'es'`
     * changes no observable behaviour and fails no test.
     *
     * It stays because it is the second line of the same defence. Anyone who
     * later softens the handler — to a warning, say — would otherwise switch a
     * silent fallback back on without touching a line that mentions one.
     */
    fallbackLocale: false,

    messages: { es: SPANISH_MESSAGES, en: ENGLISH_MESSAGES },

    /*
     * The keys are flat identifiers that happen to contain dots, not paths into
     * nested objects. The default resolver would split `history.column.date`
     * into three steps and find nothing, so it is told to look the key up
     * whole. That keeps one catalogue file per language, flat and greppable:
     * every sentence in the product is one line, and `grep` finds the message
     * from the key a component asks for.
     */
    messageResolver: (messages, key) =>
      (messages as Record<string, string | undefined>)[key] ?? null,

    missing: (missingLocale, key) => {
      throw new MissingMessageError(`No ${missingLocale} message for "${key}".`);
    },
  });
}

/*
 * One instance for callers that are not components: tests, and anything that
 * has to word a message without a Vue application around it.
 *
 * It carries no state between calls — every translation names the locale it
 * wants — so unlike the application's own instance it is safe to share.
 */
const DETACHED = createInterfaceI18n();

/**
 * The message, in the language asked for.
 *
 * `key` is typed as the union of everything the Spanish catalogue defines, so
 * an unknown key normally cannot be written at all. It is still checked at run
 * time, because keys are also built from values that crossed a boundary — an
 * authentication failure code, for one — and that is exactly the path where a
 * silent empty string would ship.
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
