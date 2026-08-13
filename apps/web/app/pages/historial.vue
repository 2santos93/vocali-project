<script setup lang="ts">
import type { Transcription } from '@vocali/contracts';

/*
 * The only file on this screen that touches the Nuxt runtime, and it supplies
 * `$fetch` and nothing else.
 *
 * Both calls go to `/api/*` on this origin, where the BFF proxy attaches the
 * bearer token from the httpOnly cookie. Nothing here holds a token, and
 * nothing here knows the API's address — or, now, which paths it serves: the
 * requests are built in `createHistoryRequests`, so the paths and the response
 * validation are exercised by the test suite rather than living in a page Jest
 * never mounts.
 */
const requests = createHistoryRequests((path: string, query: Record<string, string>) =>
  $fetch<unknown>(path, { query }),
);

const history = useTranscriptionHistory(requests.listTranscriptions);

const download = useTranscriptionDownload(requests.requestDownloadUrl);

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
  void navigateTo(SIGN_IN_ROUTE);
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
