import { createTranslations, TRANSLATIONS } from '../i18n/translations';

/**
 * The one place the reader's language is joined to the components that render
 * in it.
 *
 * A plugin rather than a call in each layout, because `provide` on the Vue
 * application reaches every component including the ones a page renders
 * directly, and because there is then exactly one instance of it: two layouts
 * each providing their own would be two languages on two screens.
 *
 * This is also the boundary the architecture depends on. Everything above it —
 * the cookie, `useState`, the Nuxt runtime — stays here; everything below it
 * receives a plain object with a `t` function and knows nothing about how it
 * was made, which is what keeps the design system mountable under Jest.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const language = useInterfaceLanguage();

  nuxtApp.vueApp.provide(TRANSLATIONS, createTranslations(language.current));
});
