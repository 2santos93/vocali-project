<script setup lang="ts">
import { computed } from 'vue';
import { useTranslations } from '../../i18n/translations';
import type { ThemePreference } from '../../utils/theme';
import SpinnerIcon from '../atoms/SpinnerIcon.vue';
import { useDropdown } from '../dropdown';
import ThemeSwitch from './ThemeSwitch.vue';

/**
 * Everything about the person signed in, behind one button.
 *
 * The header used to lay this out flat — a theme select, the address, and a
 * sign-out button — and the flat version has a hard ceiling: those three grow
 * whenever the account gains anything, they compete with the navigation for
 * the same line, and a long address is common, so the control nobody may lose
 * was the one being pushed off a narrow screen. Collapsed to a menu they cost
 * one avatar, and the address can be shown in full instead of truncated.
 *
 * **A disclosure, not a `role="menu"`.** The panel holds a switch, a button
 * and a link-like control, and `role="menu"` would promise a keyboard contract
 * — arrow keys between items, Tab leaving the whole menu — that these are not.
 * Left as ordinary controls in a panel, Tab walks them in order, Escape closes
 * it, and every one of them announces what it actually is. A menu role with
 * no arrow keys behind it is worse than no role at all.
 *
 * Presentational: it is told the address, the theme, and whether a sign-out is
 * in flight, and it reports what was pressed. The layout owns the session.
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

/**
 * The one letter on the avatar.
 *
 * A question mark rather than an empty circle when there is nothing to take it
 * from. The layout only renders this for a signed-in user so the address is
 * never blank in practice, but a blank avatar reads as a rendering fault and
 * this reads as an unknown account.
 */
const initial = computed<string>(() => props.email.trim().charAt(0).toUpperCase() || '?');
</script>

<template>
  <div ref="container" class="relative">
    <!--
      `h-9` rather than a height that falls out of the padding, and the same
      `h-9` `LanguageToggle` carries. The two sit side by side in the header,
      and their contents are different sizes — a 28px avatar here, a 16px flag
      there — so padding alone made one button visibly taller than the other.
      A fixed height is what keeps them level whatever goes inside.
    -->
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
      <!-- The initial is decoration on top of an accessible name that already
           carries the whole address, so it is hidden rather than read out as a
           lone letter between the button's name and its state. -->
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
      <!--
        Shown in full and allowed to wrap. The flat header had to truncate it
        to keep the sign-out button on screen; there is nothing to protect it
        from here, and a half-shown address is exactly what somebody opening
        this menu is trying to check — which account am I in.
      -->
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

      <!--
        A row rather than a `BaseButton`, so that the three things in this
        panel line up: same padding, same left-aligned icon, same hit area
        spanning the panel. A centred pill between two left-aligned rows reads
        as a different kind of thing, and it is not one.

        The menu stays open while the request is in flight. Closing it on the
        press would take the spinner away with it, leaving a header that looks
        idle while a sign-out is happening; the layout replaces the whole
        chrome when the session ends, which is what closes this.
      -->
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
