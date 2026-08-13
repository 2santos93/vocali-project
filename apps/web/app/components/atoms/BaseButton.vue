<script setup lang="ts">
import { computed } from 'vue';
import { useTranslations } from '../../i18n/translations';
import type { ButtonVariant, ControlSize } from '../types';
import SpinnerIcon from './SpinnerIcon.vue';

interface Props {
  variant?: ButtonVariant;
  size?: ControlSize;
  /**
   * Defaults to `button`, not to the HTML default of `submit`. A button
   * dropped inside a form to trigger something unrelated must not submit it.
   */
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
  /**
   * Announced while `loading` is true. Null falls back to a general word,
   * translated where it is rendered rather than where it is declared — a prop
   * default is evaluated once, and would freeze one language into the atom.
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
  // `brand-solid` rather than a rung of the brand scale. The scale reverses
  // between the two themes because its rungs are text on a surface, and a
  // filled button is the one place the brand is the surface. In the light
  // theme these are the same two colours the scale gave before.
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

/**
 * Loading is a form of unavailability. Leaving the button live while a request
 * is in flight is how a user sends the same upload twice.
 */
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
