<script setup lang="ts">
import { computed } from 'vue';
import BaseButton from '../atoms/BaseButton.vue';

interface Props {
  /**
   * `empty` means there is genuinely nothing yet and the user should be
   * invited to start; `error` means the list failed to load and what is on
   * screen is not the truth. Collapsing the two tells someone whose request
   * failed that they have no transcriptions, which is a lie.
   */
  variant?: 'empty' | 'error';
  title: string;
  description?: string | null;
  /** Omitted when there is nothing useful to offer. */
  actionLabel?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'empty',
  description: null,
  actionLabel: null,
});

const emit = defineEmits<{ action: [] }>();

const isError = computed<boolean>(() => props.variant === 'error');
</script>

<template>
  <div
    :class="[
      isError ? 'border-danger-line bg-danger-soft' : 'border-line bg-surface',
      'flex flex-col items-center gap-2 rounded-panel border px-6 py-12 text-center',
    ]"
    :role="isError ? 'alert' : 'status'"
    data-testid="empty-state"
  >
    <p :class="[isError ? 'text-danger-ink' : 'text-ink', 'text-base font-semibold']">
      {{ title }}
    </p>
    <p
      v-if="description !== null"
      :class="[isError ? 'text-danger-ink' : 'text-ink-muted', 'text-sm']"
    >
      {{ description }}
    </p>
    <BaseButton
      v-if="actionLabel !== null"
      :variant="isError ? 'secondary' : 'primary'"
      class="mt-2"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </BaseButton>
  </div>
</template>
