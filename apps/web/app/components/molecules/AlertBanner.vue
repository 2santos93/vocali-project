<script setup lang="ts">
import { computed } from 'vue';
import { useTranslations } from '../../i18n/translations';
import type { AlertVariant } from '../types/AlertVariant';

interface Props {
  variant?: AlertVariant;
  title?: string | null;
  message: string;
  dismissible?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'info',
  title: null,
  dismissible: false,
});

const emit = defineEmits<{ dismiss: [] }>();

const { t } = useTranslations();

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  info: 'bg-info-soft border-info-line text-info-ink',
  success: 'bg-success-soft border-success-line text-success-ink',
  warning: 'bg-warning-soft border-warning-line text-warning-ink',
  error: 'bg-danger-soft border-danger-line text-danger-ink',
};

/*
 * role="alert" is assertive, cutting across whatever a screen reader is
 * saying. Using it for "sesión iniciada" trains the user to ignore the one
 * announcement that had to be heard, so only warnings and failures get it.
 */
const isUrgent = computed<boolean>(() => props.variant === 'warning' || props.variant === 'error');
const role = computed<'alert' | 'status'>(() => (isUrgent.value ? 'alert' : 'status'));

const variantClass = computed<string>(() => VARIANT_CLASSES[props.variant]);
</script>

<template>
  <div
    :class="[variantClass, 'flex items-start gap-3 rounded-panel border px-4 py-3']"
    :role="role"
    data-testid="alert-banner"
  >
    <div class="flex-1 text-sm">
      <p v-if="title !== null" class="font-semibold">{{ title }}</p>
      <p>{{ message }}</p>
    </div>

    <button
      v-if="dismissible"
      type="button"
      class="rounded-control p-1 leading-none transition-colors hover:bg-current/10 focus-visible:focus-ring"
      :aria-label="t('common.dismiss')"
      data-testid="alert-dismiss"
      @click="emit('dismiss')"
    >
      <span aria-hidden="true">&times;</span>
    </button>
  </div>
</template>
