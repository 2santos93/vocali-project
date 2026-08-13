<script setup lang="ts">
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
