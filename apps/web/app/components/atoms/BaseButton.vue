<script setup lang="ts">
import { computed } from 'vue';
import { useTranslations } from '../../i18n/translations';
import type { ButtonVariant, ControlSize } from '../types/controls';
import SpinnerIcon from './SpinnerIcon.vue';

interface Props {
  variant?: ButtonVariant;
  size?: ControlSize;
  /** Defaults to `button`: one dropped into a form must not submit it. */
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
  /**
   * Null rather than a default sentence: a prop default is evaluated where the
   * component is declared, so it would freeze one language into the atom.
   */
  loadingLabel?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  block: false,
  loadingLabel: null,
});

const { t } = useTranslations();

const busyLabel = computed<string>(() => props.loadingLabel ?? t('common.processing'));

const emit = defineEmits<{ click: [event: MouseEvent] }>();

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-solid text-ink-inverse hover:bg-brand-solid-hover border border-transparent',
  secondary: 'bg-surface text-brand-700 border border-line hover:bg-brand-50',
  danger: 'bg-danger-solid text-ink-inverse hover:bg-danger-ink border border-transparent',
  ghost: 'bg-transparent text-brand-700 border border-transparent hover:bg-brand-50',
};

const SIZE_CLASSES: Record<ControlSize, string> = {
  sm: 'text-sm px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-base px-5 py-2.5 gap-2',
};

/** Loading disables too: a live button during a request sends the upload twice. */
const isInoperable = computed<boolean>(() => props.disabled || props.loading);

const variantClass = computed<string>(() => VARIANT_CLASSES[props.variant]);
const sizeClass = computed<string>(() => SIZE_CLASSES[props.size]);
</script>

<template>
  <button
    :type="type"
    :class="[
      variantClass,
      sizeClass,
      block ? 'flex w-full' : 'inline-flex',
      'items-center justify-center rounded-control font-medium transition-colors',
      'focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-60',
    ]"
    :disabled="isInoperable"
    :aria-busy="loading ? 'true' : undefined"
    @click="emit('click', $event)"
  >
    <SpinnerIcon v-if="loading" :size="size" :label="busyLabel" />
    <slot />
  </button>
</template>
