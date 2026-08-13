<script setup lang="ts">
import { computed } from 'vue';
import { useTranslations } from '../../i18n/translations';
import type { ControlSize } from '../types/ControlSize';

interface Props {
  size?: ControlSize;
  /**
   * Null rather than a default sentence: a prop default is evaluated where the
   * component is declared, so it cannot be translated.
   */
  label?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  label: null,
});

const { t } = useTranslations();

const spinnerLabel = computed<string>(() => props.label ?? t('common.loading'));

const SIZE_CLASSES: Record<ControlSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const sizeClass = computed<string>(() => SIZE_CLASSES[props.size]);
</script>

<template>
  <svg
    class="animate-spin"
    :class="sizeClass"
    viewBox="0 0 24 24"
    fill="none"
    role="img"
    :aria-label="spinnerLabel"
    data-testid="spinner-icon"
  >
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
    <path class="opacity-90" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2Z" />
  </svg>
</template>
