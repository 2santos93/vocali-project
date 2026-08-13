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
 *
 * The two preference controls are therefore loose rather than behind an avatar:
 * the menu that holds them on the signed-in screens is an *account* menu, and
 * there is no account here to open one for.
 */
const theme = useThemePreference();
const language = useInterfaceLanguage();
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <div class="flex flex-wrap items-start justify-end gap-4 px-4 py-3 sm:px-6">
      <!-- Boxed, because loose on the page the switch and the line under it
           would read as two unrelated controls that happen to be adjacent. -->
      <div class="w-52 rounded-panel border border-line bg-surface p-1">
        <ThemeSwitch
          :preference="theme.preference.value"
          :dark="theme.isDark.value"
          @update:preference="theme.choose($event)"
        />
      </div>

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
