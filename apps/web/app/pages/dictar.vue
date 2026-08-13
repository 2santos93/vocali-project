<script setup lang="ts">
import type { TranscriptionLanguage } from '@vocali/contracts';
import { computed } from 'vue';
import { useTranslations } from '../i18n/translations';
import type { ApiRequester } from '../utils/types/api';

const { t } = useTranslations();

useHead({ title: computed<string>(() => t('dictation.title')) });

let pendingWait: ReturnType<typeof setTimeout> | null = null;

const request: ApiRequester = (path, options) => $fetch(path, options);

const recorder = useAudioRecorder({
  ...createRealtimeRequests(request),

  capture: createWorkletAudioCapture(),

  createSocket(url: string) {
    return new WebSocket(url);
  },

  now: () => Date.now(),

  wait(milliseconds: number) {
    return new Promise<void>((resolve) => {
      pendingWait = setTimeout(resolve, milliseconds);
    });
  },
});

const { phase, finalText, partialText, failure, transcription, hasRecoverableText } = recorder;

function onStart(language: TranscriptionLanguage): void {
  void recorder.start(language);
}

function onStop(): void {
  void recorder.stop();
}

function onSaveRecovered(): void {
  void recorder.saveRecoveredText();
}

function onDiscard(): void {
  void recorder.discard();
}

onBeforeUnmount(() => {
  if (pendingWait !== null) {
    clearTimeout(pendingWait);
  }
  void recorder.discard();
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold text-ink">{{ t('dictation.title') }}</h1>
      <p class="text-sm text-ink-muted">{{ t('dictation.description') }}</p>
    </div>

    <RecordingPanel
      :phase="phase"
      :final-text="finalText"
      :partial-text="partialText"
      :failure="failure"
      :has-recoverable-text="hasRecoverableText"
      :transcription="transcription"
      @start="onStart"
      @stop="onStop"
      @save-recovered="onSaveRecovered"
      @discard="onDiscard"
    />
  </div>
</template>
