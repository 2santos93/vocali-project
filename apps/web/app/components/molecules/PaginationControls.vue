<script setup lang="ts">
import BaseButton from '../atoms/BaseButton.vue';

interface Props {
  /**
   * Which page is on screen, counted by the caller.
   *
   * There is deliberately no total and no page list. The API paginates by an
   * opaque DynamoDB cursor, so "page 7" is not expressible: reaching it means
   * walking pages one to six first, which is the cost the data model was
   * chosen to avoid. Previous is served from a client-side stack of cursors
   * already visited, never by asking the server for a page backwards.
   */
  pageNumber: number;
  hasPrevious: boolean;
  hasNext: boolean;
  /** True while a page is loading, so neither button can be pressed twice. */
  busy?: boolean;
}

withDefaults(defineProps<Props>(), { busy: false });

const emit = defineEmits<{
  previous: [];
  next: [];
}>();
</script>

<template>
  <nav class="flex items-center justify-between gap-4" aria-label="Paginación del historial">
    <BaseButton
      variant="secondary"
      size="sm"
      :disabled="!hasPrevious || busy"
      data-testid="pagination-previous"
      @click="emit('previous')"
    >
      Anterior
    </BaseButton>

    <p class="text-sm text-ink-muted" aria-live="polite">Página {{ pageNumber }}</p>

    <BaseButton
      variant="secondary"
      size="sm"
      :disabled="!hasNext || busy"
      data-testid="pagination-next"
      @click="emit('next')"
    >
      Siguiente
    </BaseButton>
  </nav>
</template>
