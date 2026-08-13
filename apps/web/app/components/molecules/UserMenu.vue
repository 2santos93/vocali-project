<script setup lang="ts">
import { computed } from 'vue';
import { useTranslations } from '../../i18n/translations';
import type { ThemePreference } from '../../utils/types/theme';
import SpinnerIcon from '../atoms/SpinnerIcon.vue';
import { useDropdown } from '../dropdown';
import ThemeSwitch from './ThemeSwitch.vue';

/**
 * A disclosure, deliberately not a `role="menu"`. The panel holds a switch and
 * two buttons; `role="menu"` would promise arrow-key navigation and Tab
 * leaving the whole menu, which these do not implement. As ordinary controls
 * Tab walks them in order and each announces what it actually is.
 */
interface Props {
  email: string;
  preference: ThemePreference;
  /** The palette actually on screen, with `system` already resolved. */
  dark: boolean;
  signingOut?: boolean;
  id?: string;
}

const props = withDefaults(defineProps<Props>(), { signingOut: false, id: 'user-menu' });

const emit = defineEmits<{
  'update:preference': [preference: ThemePreference];
  'sign-out': [];
}>();

const { t } = useTranslations();

const { open, container, trigger, toggle } = useDropdown();

const panelId = computed<string>(() => `${props.id}-panel`);

/** A question mark rather than an empty circle, which reads as a broken render. */
const initial = computed<string>(() => props.email.trim().charAt(0).toUpperCase() || '?');
</script>

<template>
  <div ref="container" class="relative">
    <!-- `h-9`, the same fixed height `LanguageToggle` carries: a 28px avatar
         here and a 16px flag there left padding-derived heights unequal. -->
    <button
      :id="id"
      ref="trigger"
      type="button"
      aria-haspopup="true"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="panelId"
      :aria-label="t('session.account', { email })"
      class="flex h-9 items-center gap-1 rounded-control border border-line bg-surface pr-1.5 pl-1 transition-colors hover:bg-brand-50 focus-visible:focus-ring"
      data-testid="user-menu"
      @click="toggle()"
    >
      <span
        aria-hidden="true"
        class="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
      >
        {{ initial }}
      </span>

      <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 text-ink-muted" fill="none" aria-hidden="true">
        <path
          d="m6 9 6 6 6-6"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <div
      v-if="open"
      :id="panelId"
      class="absolute right-0 z-20 mt-1 w-64 rounded-panel border border-line bg-surface p-1 shadow-lg"
    >
      <!-- Shown in full and allowed to wrap: which account am I in is the
           question this menu is opened to answer. -->
      <p class="px-2 py-2 text-sm break-all text-ink" data-testid="signed-in-user">
        {{ email }}
      </p>

      <hr class="my-1 border-line" />

      <ThemeSwitch
        :preference="preference"
        :dark="dark"
        @update:preference="emit('update:preference', $event)"
      />

      <hr class="my-1 border-line" />

      <!-- The menu stays open while the request is in flight: closing it on the
           press would take the spinner with it, leaving a header that looks
           idle mid sign-out. The layout replaces the chrome when the session
           ends, which is what closes this. -->
      <button
        type="button"
        :disabled="signingOut"
        :aria-busy="signingOut ? 'true' : undefined"
        class="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="sign-out"
        @click="emit('sign-out')"
      >
        <SpinnerIcon v-if="signingOut" size="sm" :label="t('session.signingOut')" />
        <svg
          v-else
          viewBox="0 0 24 24"
          class="h-4 w-4 text-ink-muted"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M15 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h9M15 12H10m5 0-2.5-2.5M15 12l-2.5 2.5M18 12h1"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        {{ t('session.signOut') }}
      </button>
    </div>
  </div>
</template>
