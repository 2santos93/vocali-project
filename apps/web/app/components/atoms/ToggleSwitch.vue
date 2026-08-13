<script setup lang="ts">
interface Props {
  modelValue: boolean;
  /** Visible, and therefore also the accessible name. Never an `aria-label`. */
  label: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    class="flex w-full items-center justify-between gap-3 rounded-control px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-brand-50 focus-visible:focus-ring"
    @click="emit('update:modelValue', !props.modelValue)"
  >
    <span class="flex items-center gap-2">
      <slot name="icon" />
      {{ label }}
    </span>

    <!-- The track and thumb repeat what `aria-checked` already says. -->
    <span
      aria-hidden="true"
      :class="[
        modelValue ? 'bg-brand-solid' : 'bg-muted-line',
        'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
      ]"
    >
      <span
        :class="[
          modelValue ? 'translate-x-4' : 'translate-x-0',
          'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-ink-inverse shadow-sm transition-transform',
        ]"
      />
    </span>
  </button>
</template>
