<script setup lang="ts">
import type { Transcription, TranscriptFormat } from '@vocali/contracts';

/*
 * The only file on this screen that touches the Nuxt runtime.
 *
 * Both calls go to `/api/*` on this origin, where the BFF proxy attaches the
 * bearer token from the httpOnly cookie. Nothing here holds a token, and
 * nothing here knows the API's address.
 *
 * The requests are handed to the composables rather than made inside them, so
 * the pagination and download rules can be driven under Jest against a
 * substitute with no server, no Nuxt and no network.
 */
const history = useTranscriptionHistory((cursor: string | null): Promise<unknown> => {
  const query: Record<string, string> = cursor === null ? {} : { cursor };
  return $fetch<unknown>('/api/transcriptions', { query });
});

const download = useTranscriptionDownload(
  (transcriptionId: string, format: TranscriptFormat): Promise<unknown> =>
    $fetch<unknown>(`/api/transcriptions/${transcriptionId}/download`, { query: { format } }),
);

/*
 * Loaded on mount rather than during render, so the history is fetched in the
 * browser with the user's own session and never rendered into the server's
 * HTML. A clinician's list of patients' recordings does not belong in a
 * cacheable server response.
 */
onMounted(() => {
  void history.loadFirstPage();
});

useHead({ title: 'Historial de transcripciones' });

function goToPreviousPage(): void {
  void history.goToPreviousPage();
}

function goToNextPage(): void {
  void history.goToNextPage();
}

function retryCurrentPage(): void {
  void history.retryCurrentPage();
}

function goToSignIn(): void {
  void navigateTo('/login');
}

function goToFileTranscription(): void {
  void navigateTo('/transcribir');
}

function downloadTranscript(transcription: Transcription): void {
  void download.download(transcription);
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold text-ink">Historial de transcripciones</h1>
      <p class="text-sm text-ink-muted">
        Tus transcripciones, de la más reciente a la más antigua, en páginas de
        {{ history.pageSize }}.
      </p>
    </header>

    <TranscriptionHistoryTable
      :transcriptions="history.transcriptions.value"
      :loading="history.loading.value"
      :load-error-message="history.errorMessage.value"
      :session-expired="history.sessionExpired.value"
      :download-error-message="download.errorMessage.value"
      :downloading-id="download.downloadingId.value"
      :page-number="history.pageNumber.value"
      :has-previous="history.hasPrevious.value"
      :has-next="history.hasNext.value"
      @previous="goToPreviousPage"
      @next="goToNextPage"
      @retry="retryCurrentPage"
      @sign-in="goToSignIn"
      @upload="goToFileTranscription"
      @download="downloadTranscript"
      @dismiss-download-error="download.dismissError"
    />
  </div>
</template>
