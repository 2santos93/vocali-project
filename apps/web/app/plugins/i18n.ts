import { watch } from 'vue';
import { createInterfaceI18n } from '../i18n/translate';

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
