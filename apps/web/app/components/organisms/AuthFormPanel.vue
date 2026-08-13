<script setup lang="ts">
import { useTranslations } from '../../i18n/translations';
import AlertBanner from '../molecules/AlertBanner.vue';

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
  <div class="flex flex-1 items-center justify-center px-4 py-10">
    <div class="w-full max-w-md">
      <div class="mb-6 text-center">
        <p class="text-lg font-semibold tracking-tight text-brand-700">Vocali</p>
        <p class="text-sm text-ink-muted">{{ t('brand.tagline') }}</p>
      </div>

      <div class="rounded-panel border border-line bg-surface p-6 shadow-sm sm:p-8">
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
