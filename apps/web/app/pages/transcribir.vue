<script setup lang="ts">
import type { TranscriptionLanguage } from '@vocali/contracts';
import { computed } from 'vue';
import { useTranslations } from '../i18n/translations';

/**
 * Transcribing an audio file.
 *
 * The page is the wiring, and deliberately nothing else. It is the only layer
 * allowed to touch the Nuxt runtime, so it is where `$fetch` lives; the flow
 * itself is in `useFileUpload` and the interface is in
 * `FileTranscriptionPanel`, both of which Jest can drive without booting Nuxt.
 */

const { t } = useTranslations();

useHead({ title: computed<string>(() => t('file.title')) });

/*
 * Held so it can be cancelled. Without this, navigating away mid-upload leaves
 * a timer that wakes a poll loop belonging to a component that no longer
 * exists — it would keep calling the API from a page the user has left.
 */
let pendingPoll: ReturnType<typeof setTimeout> | null = null;

onBeforeUnmount(() => {
  if (pendingPoll !== null) {
    clearTimeout(pendingPoll);
  }
});

/*
 * The one place `$fetch` appears. Everything below the page takes this
 * function as an argument, which is what lets Jest exercise the paths, the
 * request bodies and the response validation without a Nuxt runtime.
 */
const request: ApiRequester = (path, options) => $fetch(path, options);

const gateway: FileUploadGateway = {
  ...createUploadRequests(request),

  // Straight to S3, with the fields the intent returned. The BFF proxy is not
  // involved: routing 20 MB of audio through a Nitro server that has nothing
  // to add to it would only make the upload slower and the server larger.
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

function onSubmit(request: { file: File; language: TranscriptionLanguage }): void {
  void upload(request.file, request.language);
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

    <!-- The full stop sits outside the link and outside the catalogue: it is
         punctuation, identical in both languages, and a key holding "." would
         be a translator's invitation to change it. -->
    <p class="text-sm text-ink-muted">
      {{ t('file.historyPrefix') }}
      <NuxtLink to="/historial" class="font-medium text-brand-700 underline">{{
        t('common.historyLink')
      }}</NuxtLink
      >.
    </p>
  </div>
</template>
