<script setup lang="ts">
import type { Transcription, TranscriptionSource } from '@vocali/contracts';
import { computed } from 'vue';
import SpinnerIcon from '../atoms/SpinnerIcon.vue';
import StatusBadge from '../atoms/StatusBadge.vue';
import BaseButton from '../atoms/BaseButton.vue';
import AlertBanner from '../molecules/AlertBanner.vue';
import EmptyState from '../molecules/EmptyState.vue';
import PaginationControls from '../molecules/PaginationControls.vue';
import type { MessageKey, TranslatableMessage } from '../../i18n/types';
import { useTranslations } from '../../i18n/translations';
import { formatDateTime, formatDuration, formatFileSize } from '../format';

interface Props {
  transcriptions: readonly Transcription[];
  loading?: boolean;
  /** A failed load and an empty history are different facts, kept apart. */
  loadErrorMessage?: TranslatableMessage | null;
  /**
   * The third case: retrying a request that will 401 again is not a remedy,
   * and signing in is.
   */
  sessionExpired?: boolean;
  /** Reported separately: the list is fine, the download is what failed. */
  downloadErrorMessage?: TranslatableMessage | null;
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

const { t, locale } = useTranslations();

const NOT_AVAILABLE = '—';

const SOURCE_KEYS: Record<TranscriptionSource, MessageKey> = {
  FILE: 'history.source.FILE',
  MICROPHONE: 'history.source.MICROPHONE',
};

/** An em dash says "not yet"; a zero would say "silent audio". */
function durationCell(seconds: number | null): string {
  return seconds === null ? NOT_AVAILABLE : formatDuration(seconds);
}

function sizeCell(bytes: number | null): string {
  return bytes === null ? NOT_AVAILABLE : formatFileSize(bytes, locale.value);
}

function dateCell(isoDate: string): string {
  return formatDateTime(isoDate, locale.value);
}

function sourceLabel(source: TranscriptionSource): string {
  return t(SOURCE_KEYS[source]);
}

/**
 * The affordance, not the control: `useTranscriptionDownload` enforces the
 * same rule where the request is actually issued.
 */
function isDownloadable(transcription: Transcription): boolean {
  return transcription.status === 'COMPLETED';
}

// A spinner replaces the table only when there is nothing to replace: later
// pages load underneath rather than blanking what the user was reading.
const isFirstLoad = computed<boolean>(() => props.loading && props.transcriptions.length === 0);

const isEmpty = computed<boolean>(
  () => !props.loading && props.loadErrorMessage === null && props.transcriptions.length === 0,
);

const errorTitle = computed<string>(() =>
  props.sessionExpired ? t('history.sessionExpiredTitle') : t('history.loadFailedTitle'),
);

const errorActionLabel = computed<string>(() =>
  props.sessionExpired ? t('history.signIn') : t('history.retry'),
);

/*
 * One button, two intents. Repeating a request that will 401 again looks to
 * the user like the product refusing to work.
 */
function onErrorAction(): void {
  if (props.sessionExpired) {
    emit('signIn');
    return;
  }
  emit('retry');
}

const isFirstPage = computed<boolean>(() => props.pageNumber <= 1);

const emptyTitle = computed<string>(() =>
  isFirstPage.value ? t('history.emptyTitle') : t('history.pageEmptyTitle'),
);

const emptyDescription = computed<string>(() =>
  isFirstPage.value ? t('history.emptyDescription') : t('history.pageEmptyDescription'),
);

const emptyActionLabel = computed<string | null>(() =>
  isFirstPage.value ? t('history.emptyAction') : null,
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
      :message="t(downloadErrorMessage)"
      dismissible
      @dismiss="emit('dismissDownloadError')"
    />

    <EmptyState
      v-if="loadErrorMessage !== null"
      variant="error"
      :title="errorTitle"
      :description="t(loadErrorMessage)"
      :action-label="errorActionLabel"
      @action="onErrorAction"
    />

    <div
      v-else-if="isFirstLoad"
      class="flex items-center justify-center gap-2 rounded-panel border border-line bg-surface px-6 py-12 text-sm text-ink-muted"
      role="status"
      data-testid="history-loading"
    >
      <SpinnerIcon size="lg" :label="t('common.loading')" />
      <span>{{ t('history.loading') }}</span>
    </div>

    <EmptyState
      v-else-if="isEmpty"
      :title="emptyTitle"
      :description="emptyDescription"
      :action-label="emptyActionLabel"
      @action="emit('upload')"
    />

    <!-- The table scrolls inside its own box; letting it set the document width
         drags the whole page sideways on a phone. -->
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
          {{
            t('history.caption')
          }}
        </caption>
        <thead class="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th scope="col" class="px-4 py-3 font-medium">{{ t('history.column.file') }}</th>
            <th scope="col" class="px-4 py-3 font-medium">{{ t('history.column.source') }}</th>
            <th scope="col" class="px-4 py-3 font-medium">{{ t('history.column.status') }}</th>
            <th scope="col" class="px-4 py-3 font-medium">{{ t('history.column.duration') }}</th>
            <th scope="col" class="px-4 py-3 font-medium">{{ t('history.column.size') }}</th>
            <th scope="col" class="px-4 py-3 font-medium">{{ t('history.column.date') }}</th>
            <th scope="col" class="px-4 py-3 font-medium">{{ t('history.column.actions') }}</th>
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
              {{ durationCell(transcription.durationSeconds) }}
            </td>
            <td class="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">
              {{ sizeCell(transcription.sizeBytes) }}
            </td>
            <td class="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">
              {{ dateCell(transcription.createdAt) }}
            </td>
            <td class="px-4 py-3">
              <BaseButton
                v-if="isDownloadable(transcription)"
                variant="secondary"
                size="sm"
                :loading="downloadingId === transcription.id"
                :loading-label="t('history.preparingDownload')"
                data-testid="history-download"
                @click="emit('download', transcription)"
              >
                {{ t('history.download') }}
              </BaseButton>
              <!-- An em dash reads aloud as punctuation, so the sentence is for
                   the screen reader and the dash for everyone else. -->
              <span v-else class="text-ink-muted" data-testid="history-no-actions">
                <span aria-hidden="true">{{ NOT_AVAILABLE }}</span>
                <span class="sr-only">{{ t('history.noDownload') }}</span>
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
