<script setup lang="ts">
/**
 * The chrome for the three screens that have no session yet.
 *
 * They used to render with `layout: false`, which was right when there was
 * nothing to put around them. There is now: the theme is a preference of the
 * person reading, not of the account, and somebody who works in a dark room
 * meets this application at the sign-in form. A control that only appears
 * after signing in is a control that arrives one screen too late.
 *
 * Deliberately not the application header. There is no session, so there is no
 * navigation, no address and no sign-out — showing that chrome greyed out
 * would suggest an account that exists.
 */
const theme = useThemePreference();
const language = useInterfaceLanguage();
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <div class="flex flex-wrap items-center justify-end gap-4 px-4 py-3 sm:px-6">
      <ThemeToggle :preference="theme.preference.value" @update:preference="theme.choose($event)" />
      <LanguageToggle
        :language="language.current.value"
        @update:language="language.choose($event)"
      />
    </div>

    <main class="flex flex-1 flex-col">
      <slot />
    </main>
  </div>
</template>
