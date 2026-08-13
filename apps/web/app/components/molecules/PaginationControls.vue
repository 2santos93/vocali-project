<script setup lang="ts">
import { useTranslations } from '../../i18n/translations';
import BaseButton from '../atoms/BaseButton.vue';

interface Props {
  pageNumber: number;
  hasPrevious: boolean;
  hasNext: boolean;
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
