<script setup lang="ts">
const theme = useThemePreference();
const language = useInterfaceLanguage();

useHead({ htmlAttrs: { class: theme.rootClass, lang: language.locale } });
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
