import { watch } from 'vue';
import { createInterfaceI18n } from '../i18n/translate';

/**
 * The one place the reader's language is joined to the components that render
 * in it.
 *
 * A plugin rather than a call in each layout, because `vue-i18n` installs onto
 * the Vue application and so reaches every component including the ones a page
 * renders directly — and because there is then exactly one instance of it: two
 * layouts each creating their own would be two languages on two screens.
 *
 * The instance is built here, per Nuxt application, rather than imported from
 * a module. A server renders two requests at once, and an instance shared
 * between them is one reader's language deciding what the other reader sees.
 *
 * This is also the boundary the architecture depends on. Everything above it —
 * the cookie, `useState`, the Nuxt runtime — stays here; everything below
 * receives a Vue plugin and knows nothing about how the language was chosen,
 * which is what keeps the design system mountable under Jest.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const language = useInterfaceLanguage();

  const i18n = createInterfaceI18n(language.current.value);

  // The cookie-backed state stays the source of truth and the instance follows
  // it, rather than the two being written to separately and drifting.
  watch(language.current, (chosen) => {
    i18n.global.locale.value = chosen;
  });

  nuxtApp.vueApp.use(i18n);
});
