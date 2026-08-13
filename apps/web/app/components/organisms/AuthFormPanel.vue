<script setup lang="ts">
import { useTranslations } from '../../i18n/translations';
import AlertBanner from '../molecules/AlertBanner.vue';

/**
 * The chrome shared by signing in, registering and confirming an address.
 *
 * Presentational, like everything else under `components/`: it fetches
 * nothing, knows no route and holds no session. The three pages differ in
 * their fields and in what they do with a submission, and agreeing on one
 * panel is what stops them from differing in heading level, error placement
 * and focus order as well.
 */

interface Props {
  title: string;
  description?: string | null;
  /** Shown as an assertive alert. Null when nothing has gone wrong. */
  error?: string | null;
  /** Shown as a polite status. An acknowledgement, not an interruption. */
  notice?: string | null;
}

withDefaults(defineProps<Props>(), {
  description: null,
  error: null,
  notice: null,
});

const { t } = useTranslations();
</script>

<template>
  <!-- `flex-1` rather than `min-h-screen`: the panel now sits below the
       preference controls, and a full viewport height under them would push
       the form off the bottom of the screen by exactly their height. -->
  <div class="flex flex-1 items-center justify-center px-4 py-10">
    <div class="w-full max-w-md">
      <div class="mb-6 text-center">
        <p class="text-lg font-semibold tracking-tight text-brand-700">Vocali</p>
        <p class="text-sm text-ink-muted">{{ t('brand.tagline') }}</p>
      </div>

      <div class="rounded-panel border border-line bg-surface p-6 shadow-sm sm:p-8">
        <!-- The only h1 on these pages. The panel owns it because the heading
             and the form it introduces have to stay adjacent to be announced
             as a unit. -->
        <h1 class="text-xl font-semibold text-ink">{{ title }}</h1>
        <p v-if="description !== null" class="mt-1 text-sm text-ink-muted">{{ description }}</p>

        <!-- Above the fields, not below the button: a message a user has to
             scroll to find is a message they do not read. -->
        <div v-if="error !== null || notice !== null" class="mt-5 flex flex-col gap-3">
          <AlertBanner v-if="error !== null" variant="error" :message="error" />
          <AlertBanner v-if="notice !== null" variant="success" :message="notice" />
        </div>

        <div class="mt-6">
          <slot />
        </div>
      </div>

      <div class="mt-6 text-center text-sm text-ink-muted">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
