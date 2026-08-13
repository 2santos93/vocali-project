<script setup lang="ts">
import { computed } from 'vue';
import type { SelectOption } from '../types/controls';

interface Props {
  /** Required, because a control with no id cannot be joined to a label. */
  id: string;
  modelValue: string;
  options: readonly SelectOption[];
  /**
   * Rendered as a disabled first entry: without it the first real option is
   * pre-selected, and "I did not choose" reads as "I chose the first one".
   */
  placeholder?: string | null;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  describedBy?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: null,
  disabled: false,
  invalid: false,
  required: false,
  describedBy: null,
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const stateClass = computed<string>(() =>
  props.invalid ? 'border-danger-line bg-danger-soft text-danger-ink' : 'border-line bg-surface',
);

function onChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  emit('update:modelValue', target.value);
}
</script>

<template>
  <select
    :id="id"
    :value="modelValue"
    :disabled="disabled"
    :required="required"
    :class="[
      stateClass,
      'w-full rounded-control border px-3 py-2 text-sm text-ink transition-colors',
      'focus-visible:focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted',
    ]"
    :aria-invalid="invalid ? 'true' : undefined"
    :aria-describedby="describedBy ?? undefined"
    @change="onChange"
  >
    <option v-if="placeholder !== null" value="" disabled>{{ placeholder }}</option>
    <option
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled === true"
    >
      {{ option.label }}
    </option>
  </select>
</template>
