<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  /** Required, because a control with no id cannot be joined to a label. */
  id: string;
  modelValue: string;
  type?: 'text' | 'email' | 'password' | 'search';
  placeholder?: string | null;
  autocomplete?: string | null;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  /** The ids of the hint and error text, supplied by FormField. */
  describedBy?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  placeholder: null,
  autocomplete: null,
  disabled: false,
  invalid: false,
  required: false,
  describedBy: null,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  blur: [event: FocusEvent];
}>();

const stateClass = computed<string>(() =>
  props.invalid
    ? 'border-danger-line bg-danger-soft text-danger-ink placeholder:text-danger-ink/60'
    : 'border-line bg-surface text-ink placeholder:text-ink-muted',
);

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
}
</script>

<template>
  <input
    :id="id"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder ?? undefined"
    :autocomplete="autocomplete ?? undefined"
    :disabled="disabled"
    :required="required"
    :class="[
      stateClass,
      'w-full rounded-control border px-3 py-2 text-sm transition-colors',
      'focus-visible:focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted',
    ]"
    :aria-invalid="invalid ? 'true' : undefined"
    :aria-describedby="describedBy ?? undefined"
    @input="onInput"
    @blur="emit('blur', $event)"
  />
</template>
