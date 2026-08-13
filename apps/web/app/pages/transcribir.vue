<script setup lang="ts">
import { computed } from 'vue';
import type { FileUploadGateway } from '../composables/types/upload';
import { useTranslations } from '../i18n/translations';
import type { ApiRequester } from '../utils/types/api';

const { t } = useTranslations();

useHead({ title: computed<string>(() => t('file.title')) });

let pendingPoll: ReturnType<typeof setTimeout> | null = null;

onBeforeUnmount(() => {
  if (pendingPoll !== null) {
    clearTimeout(pendingPoll);
  }
});

const request: ApiRequester = (path, options) => $fetch(path, options);

const gateway: FileUploadGateway = {
  ...createUploadRequests(request),

  uploadToStorage(upload) {
    return uploadToPresignedPost(upload);
  },

  wait(milliseconds: number) {
    return new Promise<void>((resolve) => {
      pendingPoll = setTimeout(resolve, milliseconds);
    });
  },
};

const { phase, progress, failure, transcription, upload, reset } = useFileUpload(gateway);

function onSubmit(file: File): void {
  void upload(file);
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold text-ink">{{ t('file.title') }}</h1>
      <p class="text-sm text-ink-muted">{{ t('file.description') }}</p>
    </div>

    <FileTranscriptionPanel
      :phase="phase"
      :progress="progress"
      :failure="failure"
      :transcription="transcription"
      @submit="onSubmit"
      @reset="reset"
    />
  </div>
</template>
