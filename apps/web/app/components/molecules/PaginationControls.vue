<script setup lang="ts">
import { useTranslations } from '../../i18n/translations';
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

const { t } = useTranslations();
</script>

<template>
  <nav class="flex items-center justify-between gap-4" :aria-label="t('history.pagination')">
    <BaseButton
      variant="secondary"
      size="sm"
      :disabled="!hasPrevious || busy"
      data-testid="pagination-previous"
      @click="emit('previous')"
    >
      {{ t('history.previous') }}
    </BaseButton>

    <p class="text-sm text-ink-muted" aria-live="polite">
      {{ t('history.page', { number: pageNumber }) }}
    </p>

    <BaseButton
      variant="secondary"
      size="sm"
      :disabled="!hasNext || busy"
      data-testid="pagination-next"
      @click="emit('next')"
    >
      {{ t('history.next') }}
    </BaseButton>
  </nav>
</template>
