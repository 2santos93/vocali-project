<script setup lang="ts">
import type { Transcription } from '@vocali/contracts';
import { computed } from 'vue';
import { useTranslations } from '../i18n/translations';

const { t } = useTranslations();

const requests = createHistoryRequests((path: string, query: Record<string, string>) =>
  $fetch<unknown>(path, { query }),
);

const history = useTranscriptionHistory(requests.listTranscriptions);

const download = useTranscriptionDownload(requests.requestDownloadUrl);

onMounted(() => {
  void history.loadFirstPage();
});

useHead({ title: computed<string>(() => t('history.title')) });

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
      <h1 class="text-2xl font-semibold text-ink">{{ t('history.title') }}</h1>
      <p class="text-sm text-ink-muted">
        {{ t('history.description', { pageSize: history.pageSize }) }}
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
