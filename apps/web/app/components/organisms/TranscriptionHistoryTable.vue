<script setup lang="ts">
import type { Transcription, TranscriptionSource } from '@vocali/contracts';
import { computed } from 'vue';
import SpinnerIcon from '../atoms/SpinnerIcon.vue';
import StatusBadge from '../atoms/StatusBadge.vue';
import BaseButton from '../atoms/BaseButton.vue';
import AlertBanner from '../molecules/AlertBanner.vue';
import EmptyState from '../molecules/EmptyState.vue';
import PaginationControls from '../molecules/PaginationControls.vue';

interface Props {
  transcriptions: readonly Transcription[];
  /** True while a page is in flight, whether the first one or a later one. */
  loading?: boolean;
  /**
   * Why the page on screen is not the truth. Null while it is.
   *
   * A failed load and an empty history are different facts, and this component
   * keeps them apart: one invites a first upload, the other admits a failure
   * and offers a way out of it.
   */
  loadErrorMessage?: string | null;
  /**
   * Whether that failure was the session ending rather than a fault, which is
   * the third case: retrying a request that will 401 again is not a remedy,
   * and signing in is.
   */
  sessionExpired?: boolean;
  /** Reported separately: the list is fine, the download is what failed. */
  downloadErrorMessage?: string | null;
  /** The transcription whose signed URL is being fetched, if any. */
  downloadingId?: string | null;
  pageNumber?: number;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  loadErrorMessage: null,
  sessionExpired: false,
  downloadErrorMessage: null,
  downloadingId: null,
  pageNumber: 1,
  hasPrevious: false,
  hasNext: false,
});

const emit = defineEmits<{
  previous: [];
  next: [];
  retry: [];
  signIn: [];
  upload: [];
  download: [transcription: Transcription];
  dismissDownloadError: [];
}>();

const NOT_AVAILABLE = '—';

const SOURCE_LABELS: Record<TranscriptionSource, string> = {
  FILE: 'Archivo',
  MICROPHONE: 'Micrófono',
};

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const BYTES_PER_KILOBYTE = 1024;
const BYTES_PER_MEGABYTE = 1024 * 1024;

const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * A record that is still uploading or has failed has no duration and no size
 * yet. An em dash says "not yet"; a zero would say "silent audio".
 */
function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return NOT_AVAILABLE;
  }
  const total = Math.round(seconds);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const remainder = total % SECONDS_PER_MINUTE;
  if (total >= SECONDS_PER_HOUR) {
    return `${String(Math.floor(total / SECONDS_PER_HOUR))}:${padded(minutes)}:${padded(remainder)}`;
  }
  return `${String(minutes)}:${padded(remainder)}`;
}

function formatDecimal(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: fractionDigits }).format(value);
}

function formatSize(bytes: number | null): string {
  if (bytes === null) {
    return NOT_AVAILABLE;
  }
  if (bytes < BYTES_PER_MEGABYTE) {
    return `${formatDecimal(bytes / BYTES_PER_KILOBYTE, 0)} kB`;
  }
  return `${formatDecimal(bytes / BYTES_PER_MEGABYTE, 1)} MB`;
}

function formatDate(isoDate: string): string {
  return DATE_FORMATTER.format(new Date(isoDate));
}

function sourceLabel(source: TranscriptionSource): string {
  return SOURCE_LABELS[source];
}

/**
 * Download is offered on a completed transcription and on nothing else: any
 * other status has no transcript object behind it, so the action could only
 * fail. The rule is enforced again in `useTranscriptionDownload`, which is
 * what actually issues the request; this is the affordance, not the control.
 */
function isDownloadable(transcription: Transcription): boolean {
  return transcription.status === 'COMPLETED';
}

// A spinner replaces the table only when there is nothing to replace. Once a
// page is on screen, the next one loads underneath it rather than blanking the
// screen the user was reading.
const isFirstLoad = computed<boolean>(() => props.loading && props.transcriptions.length === 0);

const isEmpty = computed<boolean>(
  () => !props.loading && props.loadErrorMessage === null && props.transcriptions.length === 0,
);

const errorTitle = computed<string>(() =>
  props.sessionExpired ? 'Tu sesión ha caducado' : 'No hemos podido cargar tu historial',
);

const errorActionLabel = computed<string>(() =>
  props.sessionExpired ? 'Iniciar sesión' : 'Reintentar',
);

/*
 * One button, two intents. Reintentar repeats the request that just failed,
 * which is right for a dropped connection and useless for an ended session:
 * the second 401 would look to the user like the product refusing to work.
 */
function onErrorAction(): void {
  if (props.sessionExpired) {
    emit('signIn');
    return;
  }
  emit('retry');
}

/*
 * An empty first page means the user has never transcribed anything, and the
 * useful answer is an invitation. An empty later page means the history ran
 * out between one cursor and the next — nothing is wrong, and telling someone
 * with a hundred transcriptions that they have none would be a lie.
 */
const isFirstPage = computed<boolean>(() => props.pageNumber <= 1);

const emptyTitle = computed<string>(() =>
  isFirstPage.value ? 'Todavía no tienes transcripciones' : 'Esta página ya no tiene resultados',
);

const emptyDescription = computed<string>(() =>
  isFirstPage.value
    ? 'Sube un archivo de audio o dicta desde el micrófono para crear la primera.'
    : 'Vuelve a la página anterior para seguir consultando tu historial.',
);

const emptyActionLabel = computed<string | null>(() =>
  isFirstPage.value ? 'Transcribir un archivo' : null,
);

const showsPagination = computed<boolean>(
  () =>
    props.loadErrorMessage === null &&
    !isFirstLoad.value &&
    (props.transcriptions.length > 0 || props.hasPrevious),
);
</script>

<template>
  <section class="flex flex-col gap-4" data-testid="transcription-history">
    <AlertBanner
      v-if="downloadErrorMessage !== null"
      variant="error"
      :message="downloadErrorMessage"
      dismissible
      @dismiss="emit('dismissDownloadError')"
    />

    <EmptyState
      v-if="loadErrorMessage !== null"
      variant="error"
      :title="errorTitle"
      :description="loadErrorMessage"
      :action-label="errorActionLabel"
      @action="onErrorAction"
    />

    <div
      v-else-if="isFirstLoad"
      class="flex items-center justify-center gap-2 rounded-panel border border-line bg-surface px-6 py-12 text-sm text-ink-muted"
      role="status"
      data-testid="history-loading"
    >
      <SpinnerIcon size="lg" label="Cargando" />
      <span>Cargando tu historial…</span>
    </div>

    <EmptyState
      v-else-if="isEmpty"
      :title="emptyTitle"
      :description="emptyDescription"
      :action-label="emptyActionLabel"
      @action="emit('upload')"
    />

    <!-- The table is wide, so it scrolls inside its own box. Letting it set the
         width of the document instead drags the whole page sideways on a
         phone, taking the navigation and the headings with it. -->
    <div
      v-else
      class="overflow-x-auto rounded-panel border border-line bg-surface"
      data-testid="history-scroll-container"
    >
      <table
        class="w-full min-w-3xl border-collapse text-left text-sm"
        :class="loading ? 'opacity-60' : ''"
        :aria-busy="loading"
      >
        <caption class="sr-only">
          Historial de transcripciones
        </caption>
        <thead class="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th scope="col" class="px-4 py-3 font-medium">Archivo</th>
            <th scope="col" class="px-4 py-3 font-medium">Origen</th>
            <th scope="col" class="px-4 py-3 font-medium">Estado</th>
            <th scope="col" class="px-4 py-3 font-medium">Duración</th>
            <th scope="col" class="px-4 py-3 font-medium">Tamaño</th>
            <th scope="col" class="px-4 py-3 font-medium">Fecha</th>
            <th scope="col" class="px-4 py-3 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="transcription in transcriptions"
            :key="transcription.id"
            class="border-b border-line last:border-b-0"
            data-testid="history-row"
          >
            <th scope="row" class="max-w-xs px-4 py-3 font-medium text-ink">
              <!-- Clinical file names run long and are distinguished by their
                   ends, so the truncated text keeps the full name reachable. -->
              <span class="block truncate" :title="transcription.fileName">
                {{ transcription.fileName }}
              </span>
              <span
                v-if="transcription.errorMessage !== null"
                class="mt-1 block truncate text-xs font-normal text-danger-ink"
                :title="transcription.errorMessage"
                data-testid="row-error-message"
              >
                {{ transcription.errorMessage }}
              </span>
              <span
                v-else-if="transcription.textPreview !== null"
                class="mt-1 block truncate text-xs font-normal text-ink-muted"
                data-testid="row-text-preview"
              >
                {{ transcription.textPreview }}
              </span>
            </th>
            <td class="px-4 py-3 text-ink-muted">{{ sourceLabel(transcription.source) }}</td>
            <td class="px-4 py-3"><StatusBadge :status="transcription.status" /></td>
            <td class="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">
              {{ formatDuration(transcription.durationSeconds) }}
            </td>
            <td class="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">
              {{ formatSize(transcription.sizeBytes) }}
            </td>
            <td class="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">
              {{ formatDate(transcription.createdAt) }}
            </td>
            <td class="px-4 py-3">
              <!-- A button, not a link. The signed URL is short-lived, so it
                   is asked for when this is pressed; a link address rendered
                   with the page would be stale before most users reached it. -->
              <BaseButton
                v-if="isDownloadable(transcription)"
                variant="secondary"
                size="sm"
                :loading="downloadingId === transcription.id"
                loading-label="Preparando la descarga"
                data-testid="history-download"
                @click="emit('download', transcription)"
              >
                Descargar
              </BaseButton>
              <!-- An em dash reads aloud as punctuation, which says nothing
                   about why the row has no button. The sentence is for the
                   screen reader; the dash is for everyone else. -->
              <span v-else class="text-ink-muted" data-testid="history-no-actions">
                <span aria-hidden="true">{{ NOT_AVAILABLE }}</span>
                <span class="sr-only">Sin descarga disponible</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationControls
      v-if="showsPagination"
      :page-number="pageNumber"
      :has-previous="hasPrevious"
      :has-next="hasNext"
      :busy="loading"
      @previous="emit('previous')"
      @next="emit('next')"
    />
  </section>
</template>
