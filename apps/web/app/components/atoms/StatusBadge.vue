<script setup lang="ts">
import type { TranscriptionStatus } from '@vocali/contracts';
import { computed } from 'vue';
import type { MessageKey } from '../../i18n/translate';
import { useTranslations } from '../../i18n/translations';

interface Props {
  status: TranscriptionStatus;
}

const props = defineProps<Props>();

const { t } = useTranslations();

/*
 * The interface is translated; the code is English. `TranscriptionStatus` comes
 * from @vocali/contracts, so this map is `Record<TranscriptionStatus, …>` and
 * a status added to the backend stops the front end compiling until it has
 * been given words a clinician can read — in both catalogues, since the key it
 * names has to exist in each.
 *
 * Colour alone does not carry the meaning: each badge keeps its own text, so
 * the state survives a monochrome screen and a colour-blind reader.
 */
const STATUS_KEYS: Record<TranscriptionStatus, MessageKey> = {
  PENDING_UPLOAD: 'status.PENDING_UPLOAD',
  PROCESSING: 'status.PROCESSING',
  COMPLETED: 'status.COMPLETED',
  FAILED: 'status.FAILED',
};

const STATUS_CLASSES: Record<TranscriptionStatus, string> = {
  PENDING_UPLOAD: 'bg-muted-soft text-muted-ink border-muted-line',
  PROCESSING: 'bg-info-soft text-info-ink border-info-line',
  COMPLETED: 'bg-success-soft text-success-ink border-success-line',
  FAILED: 'bg-danger-soft text-danger-ink border-danger-line',
};

const label = computed<string>(() => t(STATUS_KEYS[props.status]));
const statusClass = computed<string>(() => STATUS_CLASSES[props.status]);
</script>

<template>
  <span
    :class="[
      statusClass,
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
    ]"
    :data-status="status"
  >
    {{ label }}
  </span>
</template>
