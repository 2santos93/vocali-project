<script setup lang="ts">
import { useTranslations } from '../../i18n/translations';
import type { ThemePreference } from '../../utils/theme';
import ToggleSwitch from '../atoms/ToggleSwitch.vue';

/**
 * Choosing between the light theme and the dark one — and giving the machine
 * its say back.
 *
 * A switch plus a link, because the preference has three values and a switch
 * has two positions. The obvious shortcut is to drop `system`, and it is the
 * wrong one: `system` is the default, so most readers have never touched this
 * control and are being shown the palette their operating system asked for. A
 * two-value model would pin all of them to light the first time anything wrote
 * the cookie, including the reader whose laptop turns dark at sunset.
 *
 * So the switch answers "is it dark right now", which is `dark` — the resolved
 * palette, not the preference — and `Como el sistema` is a separate control
 * that hands the decision back. A preference with no way back has to be got
 * right first time, and nobody gets a theme right first time.
 *
 * Presentational: both the preference and the palette it resolves to arrive as
 * props, and the chosen preference leaves as an event. Resolving `system`
 * against the machine needs `matchMedia`, which is the browser, which is
 * `useThemePreference`'s job and not a component's.
 */
interface Props {
  preference: ThemePreference;
  /** The palette actually on screen, with `system` already resolved. */
  dark: boolean;
}

defineProps<Props>();

const emit = defineEmits<{ 'update:preference': [preference: ThemePreference] }>();

const { t } = useTranslations();

/**
 * A switch reports where it was moved to, and that position is an explicit
 * choice by definition: somebody who turns dark off while following a dark
 * machine is asking for light, not asking to keep following.
 */
function onSwitch(dark: boolean): void {
  emit('update:preference', dark ? 'dark' : 'light');
}
</script>

<template>
  <!-- Named as a group, so a screen reader announces the two controls as one
       setting rather than as a switch and an unrelated button beside it. -->
  <div role="group" :aria-label="t('preferences.theme')" class="flex flex-col gap-0.5">
    <ToggleSwitch
      :model-value="dark"
      :label="t('preferences.theme.darkMode')"
      data-testid="theme-switch"
      @update:model-value="onSwitch"
    >
      <template #icon>
        <!-- A moon for the setting, in both positions. An icon that changed
             with the state would be a second, quieter answer to the same
             question, and the two disagree the moment one of them is wrong. -->
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

    <!--
      Always rendered, never hidden while it is the current state. A control
      that disappears once it applies is a control nobody discovers: the reader
      who has to find it is precisely the one who has already chosen something
      else. `aria-pressed` says which of the two it is.
    -->
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
