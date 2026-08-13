<script setup lang="ts">
/**
 * The root. It picks a layout, renders the page, and dresses the document.
 *
 * Anything put here runs on every screen including the sign-in form, which is
 * the one screen that must not assume there is a user.
 *
 * The theme class belongs here for exactly that reason: it is the one thing
 * every screen needs, signed in or not, and it has to be on the `<html>` the
 * server sends rather than added once the browser has caught up. `useHead`
 * puts it in the server's markup, so the first frame is already the right
 * colour and there is no flash to correct.
 */
const theme = useThemePreference();
const language = useInterfaceLanguage();

/*
 * `lang` is not decoration. It decides which voice a screen reader uses, and
 * an English sentence read by a Spanish voice — or the reverse — is not
 * slightly wrong, it is unintelligible. It also has to be in the server's
 * markup rather than applied afterwards, which is why it is here rather than
 * in `nuxt.config.ts` where it used to be pinned to `es`.
 */
useHead({ htmlAttrs: { class: theme.rootClass, lang: language.locale } });
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
