<script setup lang="ts">
import { useTranslations } from '../../i18n/translations';
import type { MessageKey } from '../../i18n/translate';
import { THEME_PREFERENCES } from '../../utils/theme';
import type { ThemePreference } from '../../utils/theme';

/**
 * Choosing between the light theme, the dark one, and the machine's.
 *
 * Presentational, like everything else under `components/`: the current
 * preference arrives as a prop and the chosen one leaves as an event. The
 * cookie it ends up in belongs to `useThemePreference`, which is the layer
 * allowed to touch the Nuxt runtime.
 *
 * A native `<select>` rather than a pair of icon buttons. It is operable from
 * the keyboard without a line of key handling, it announces its own state, and
 * it can hold three options — which a switch cannot, and which matters here
 * because "follow my machine" is one of them and is the default.
 */

interface Props {
  preference: ThemePreference;
  /** Overridable so two of these can coexist if a screen ever needs it. */
  id?: string;
}

withDefaults(defineProps<Props>(), { id: 'theme-preference' });

const emit = defineEmits<{ 'update:preference': [preference: ThemePreference] }>();

const { t } = useTranslations();

// Keyed by the union, so a fourth preference cannot ship without a word for it.
const OPTION_KEYS: Record<ThemePreference, MessageKey> = {
  light: 'preferences.theme.light',
  dark: 'preferences.theme.dark',
  system: 'preferences.theme.system',
};

/**
 * Narrowed rather than asserted, exactly as the language selects are. A
 * `<select>` reports a string, and a value this component did not render can
 * only come from a page somebody has edited in the developer tools.
 */
function onChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  const chosen = THEME_PREFERENCES.find((preference) => preference === value);

  if (chosen !== undefined) {
    emit('update:preference', chosen);
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- A real label, joined to the control by id. An `aria-label` would name
         it for a screen reader and leave everyone else with an unexplained
         dropdown. -->
    <label :for="id" class="text-xs font-medium text-ink-muted">{{ t('preferences.theme') }}</label>
    <select
      :id="id"
      :value="preference"
      class="rounded-control border border-line bg-surface px-2 py-1 text-sm text-ink transition-colors focus-visible:focus-ring"
      data-testid="theme-toggle"
      @change="onChange"
    >
      <option v-for="option in THEME_PREFERENCES" :key="option" :value="option">
        {{ t(OPTION_KEYS[option]) }}
      </option>
    </select>
  </div>
</template>
