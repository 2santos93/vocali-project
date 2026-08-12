<script setup lang="ts">
import type { TranscriptionStatus } from '@vocali/contracts';
import { computed } from 'vue';

interface Props {
  status: TranscriptionStatus;
}

const props = defineProps<Props>();

/*
 * The interface is Spanish; the code is English. `TranscriptionStatus` comes
 * from @vocali/contracts, so this map is `Record<TranscriptionStatus, …>` and
 * a status added to the backend stops the front end compiling until it has
 * been given words a clinician can read.
 *
 * Colour alone does not carry the meaning: each badge keeps its own text, so
 * the state survives a monochrome screen and a colour-blind reader.
 */
const STATUS_LABELS: Record<TranscriptionStatus, string> = {
  PENDING_UPLOAD: 'Pendiente de subida',
  PROCESSING: 'Procesando',
  COMPLETED: 'Completada',
  FAILED: 'Fallida',
};

const STATUS_CLASSES: Record<TranscriptionStatus, string> = {
  PENDING_UPLOAD: 'bg-muted-soft text-muted-ink border-muted-line',
  PROCESSING: 'bg-info-soft text-info-ink border-info-line',
  COMPLETED: 'bg-success-soft text-success-ink border-success-line',
  FAILED: 'bg-danger-soft text-danger-ink border-danger-line',
};

const label = computed<string>(() => STATUS_LABELS[props.status]);
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
