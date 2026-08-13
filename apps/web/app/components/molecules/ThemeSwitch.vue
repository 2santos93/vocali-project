<script setup lang="ts">
import { useTranslations } from '../../i18n/translations';
import type { ThemePreference } from '../../utils/types/theme';
import ToggleSwitch from '../atoms/ToggleSwitch.vue';

interface Props {
  preference: ThemePreference;
  /** The palette actually on screen, with `system` already resolved. */
  dark: boolean;
}

defineProps<Props>();

const emit = defineEmits<{ 'update:preference': [preference: ThemePreference] }>();

const { t } = useTranslations();

/**
 * Moving the switch is always an explicit choice: turning dark off while
 * following a dark machine asks for light, not for continuing to follow.
 */
function onSwitch(dark: boolean): void {
  emit('update:preference', dark ? 'dark' : 'light');
}
</script>

<template>
  <!-- Named as a group, so the two controls are announced as one setting. -->
  <div role="group" :aria-label="t('preferences.theme')" class="flex flex-col gap-0.5">
    <ToggleSwitch
      :model-value="dark"
      :label="t('preferences.theme.darkMode')"
      data-testid="theme-switch"
      @update:model-value="onSwitch"
    >
      <template #icon>
        <!-- A moon in both positions: an icon that changed with the state is a
             second, quieter answer to the question the switch already answers. -->
        <svg viewBox="0 0 24 24" class="h-4 w-4 text-ink-muted" fill="none" aria-hidden="true">
          <path
            d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linejoin="round"
          />
        </svg>
      </template>
    </ToggleSwitch>

    <!-- Always rendered, never hidden while it is the current state: the reader
         who needs to find it is the one who has already chosen otherwise. -->
    <button
      type="button"
      :aria-pressed="preference === 'system' ? 'true' : 'false'"
      :class="[
        preference === 'system' ? 'text-brand-700' : 'text-ink-muted',
        'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-xs transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:focus-ring',
      ]"
      data-testid="theme-system"
      @click="emit('update:preference', 'system')"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" aria-hidden="true">
        <rect
          x="3"
          y="4"
          width="18"
          height="12"
          rx="1.5"
          stroke="currentColor"
          stroke-width="1.7"
        />
        <path d="M8 20h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      </svg>
      {{ t('preferences.theme.system') }}
    </button>
  </div>
</template>
