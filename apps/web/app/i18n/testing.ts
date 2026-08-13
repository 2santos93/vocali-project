import { ref } from 'vue';
import { DEFAULT_INTERFACE_LANGUAGE } from './language';
import type { InterfaceLanguage } from './language';
import { TRANSLATIONS, createTranslations } from './translations';

/**
 * What a component test hands to `mount` so the component can speak.
 *
 * The real catalogue, never a stub. A test that mounted a component with
 * `t: (key) => key` would assert against keys, and an assertion on a key is an
 * assertion that the component asked for something — not that a reader can
 * read it. Every text expectation in this suite is a literal sentence, and it
 * is meant to fail when a translation is wrong, missing or quietly reworded.
 *
 * @example
 *   mount(StatusBadge, { props, global: withTranslations() })
 *   mount(StatusBadge, { props, global: withTranslations('en') })
 */
export function withTranslations(language: InterfaceLanguage = DEFAULT_INTERFACE_LANGUAGE): {
  provide: Record<symbol, unknown>;
} {
  return { provide: { [TRANSLATIONS]: createTranslations(ref(language)) } };
}
