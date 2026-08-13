<script setup lang="ts">
import type { TranscriptionLanguage } from '@vocali/contracts';
import { computed } from 'vue';
import { useTranslations } from '../i18n/translations';
import type { ApiRequester } from '../utils/types/api';

/**
 * Dictating by microphone.
 *
 * As with `transcribir.vue`, the page is the wiring: it is the only layer that
 * may use the Nuxt runtime, so `$fetch` lives here and nowhere below. The
 * session request and the save go through the BFF proxy; the websocket does
 * not, because the provider's short-lived credential is minted for the browser
 * to use directly and proxying binary audio through Nitro would add latency to
 * the one thing on this screen that cannot afford it.
 */

const { t } = useTranslations();

useHead({ title: computed<string>(() => t('dictation.title')) });

let pendingWait: ReturnType<typeof setTimeout> | null = null;

/*
 * The one place `$fetch` appears, as on the upload page. The session request
 * and the save go through the BFF proxy; the websocket does not, because the
 * provider's short-lived credential is minted for the browser to use directly.
 */
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

/*
 * Leaving the page must release the microphone.
 *
 * `discard` stops the capture and closes the socket. Without it, navigating
 * away mid-dictation leaves the tab holding the device with the browser's
 * recording indicator still lit — for a microphone in a consulting room that
 * is not a cosmetic difference.
 */
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
