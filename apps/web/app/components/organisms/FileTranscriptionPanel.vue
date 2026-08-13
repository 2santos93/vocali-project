<script setup lang="ts">
import { DEFAULT_TRANSCRIPTION_LANGUAGE } from '@vocali/contracts';
import type { Transcription, TranscriptionLanguage } from '@vocali/contracts';
import { computed, ref } from 'vue';
import BaseButton from '../atoms/BaseButton.vue';
import BaseSelect from '../atoms/BaseSelect.vue';
import ProgressBar from '../atoms/ProgressBar.vue';
import SpinnerIcon from '../atoms/SpinnerIcon.vue';
import StatusBadge from '../atoms/StatusBadge.vue';
import AlertBanner from '../molecules/AlertBanner.vue';
import FileDropZone from '../molecules/FileDropZone.vue';
import FormField from '../molecules/FormField.vue';
import type { FileRejection } from '../types';
import type { FileUploadFailure, FileUploadPhase } from '../../composables/useFileUpload';
import {
  TRANSCRIPTION_LANGUAGE_OPTIONS,
  toTranscriptionLanguage,
} from '../transcription-languages';

/**
 * Choosing an audio file, sending it, and watching it become a transcription.
 *
 * Pure Vue: the phase, the progress and the outcome arrive as props and the
 * intent leaves as an event. It holds only the two pieces of state that are
 * nobody else's business — which file is chosen and which language was picked
 * — because a page that had to own those would exist only to pass them
 * straight back down.
 */

interface Props {
  phase: FileUploadPhase;
  /** A percentage; `ProgressBar` clamps whatever arrives. */
  progress: number;
  failure?: FileUploadFailure | null;
  /** The record once there is one, whether it succeeded or failed. */
  transcription?: Transcription | null;
}

const props = withDefaults(defineProps<Props>(), {
  failure: null,
  transcription: null,
});

const emit = defineEmits<{
  submit: [request: { file: File; language: TranscriptionLanguage }];
  reset: [];
}>();

const selectedFile = ref<File | null>(null);
const language = ref<TranscriptionLanguage>(DEFAULT_TRANSCRIPTION_LANGUAGE);

/**
 * Why the panel cannot proceed yet — a refused file, or no file at all.
 *
 * Held as prose rather than as a code because every producer of it already has
 * the sentence: `FileDropZone` owns the limits it checked and phrases its own
 * refusal, and there is exactly one other case.
 */
const warning = ref<string | null>(null);

const isBusy = computed<boolean>(
  () => props.phase === 'requesting' || props.phase === 'uploading' || props.phase === 'processing',
);

const isFinished = computed<boolean>(
  () =>
    props.phase === 'completed' || props.phase === 'failed' || props.phase === 'stillProcessing',
);

const selectedFileName = computed<string | null>(() => selectedFile.value?.name ?? null);

function onSelect(file: File): void {
  // The previous refusal described the previous file, and leaving it on screen
  // next to a file that was accepted says the opposite of what happened.
  warning.value = null;
  selectedFile.value = file;
}

function onReject(refusal: FileRejection): void {
  warning.value = refusal.message;
  selectedFile.value = null;
}

function onLanguageChange(value: string): void {
  const chosen = toTranscriptionLanguage(value);
  if (chosen !== null) {
    language.value = chosen;
  }
}

/**
 * The button stays operable with no file chosen, and says why it cannot
 * proceed.
 *
 * A disabled control explains nothing: someone who has not noticed that the
 * drop zone rejected their file sees a dead button and no reason for it. This
 * way the guard that protects the emit is also the guard the user meets, so
 * there is one behaviour rather than two that have to agree.
 */
function onSubmit(): void {
  const file = selectedFile.value;
  if (file === null) {
    warning.value = 'Elige primero un archivo de audio para transcribirlo.';
    return;
  }
  warning.value = null;
  emit('submit', { file, language: language.value });
}

function onReset(): void {
  selectedFile.value = null;
  warning.value = null;
  emit('reset');
}
</script>

<template>
  <section class="flex flex-col gap-5" aria-labelledby="file-transcription-heading">
    <h2 id="file-transcription-heading" class="text-lg font-semibold text-ink">
      Transcribir un archivo de audio
    </h2>

    <!-- A warning rather than an error: nothing has been attempted yet, and
         the client-side checks are a courtesy — the storage policy is what
         enforces the limit. -->
    <AlertBanner
      v-if="warning !== null"
      variant="warning"
      :message="warning"
      data-testid="rejection-alert"
    />

    <AlertBanner
      v-if="failure !== null"
      variant="error"
      title="No se ha podido transcribir"
      :message="failure.message"
      data-testid="failure-alert"
    />

    <FileDropZone
      input-id="audio-file"
      :disabled="isBusy"
      :selected-file-name="selectedFileName"
      @select="onSelect"
      @reject="onReject"
    />

    <FormField
      id="audio-language"
      label="Idioma del audio"
      hint="Elige el idioma que se habla en la grabación."
    >
      <template #default="{ id, describedBy }">
        <BaseSelect
          :id="id"
          :model-value="language"
          :options="TRANSCRIPTION_LANGUAGE_OPTIONS"
          :disabled="isBusy"
          :described-by="describedBy"
          @update:model-value="onLanguageChange"
        />
      </template>
    </FormField>

    <div class="flex flex-wrap items-center gap-3">
      <BaseButton
        :disabled="isBusy"
        :loading="isBusy"
        loading-label="Transcribiendo"
        data-testid="submit-button"
        @click="onSubmit"
      >
        Transcribir
      </BaseButton>

      <BaseButton v-if="isFinished" variant="secondary" data-testid="reset-button" @click="onReset">
        Transcribir otro archivo
      </BaseButton>
    </div>

    <!-- Real progress, from XMLHttpRequest's progress event. It is shown only
         while the file is on its way: a bar during the transcription itself
         would be measuring nothing. -->
    <ProgressBar
      v-if="phase === 'uploading'"
      :value="progress"
      label="Subiendo el archivo de audio"
      data-testid="upload-progress"
    />

    <p
      v-if="phase === 'requesting'"
      class="flex items-center gap-2 text-sm text-ink-muted"
      role="status"
    >
      <SpinnerIcon label="Preparando la subida" />
      Preparando la subida…
    </p>

    <p
      v-if="phase === 'processing'"
      class="flex items-center gap-2 text-sm text-ink-muted"
      role="status"
      data-testid="processing-notice"
    >
      <SpinnerIcon label="Transcribiendo" />
      Archivo subido. Estamos transcribiéndolo; esto puede tardar un poco.
    </p>

    <!-- Not an error: the audio is stored and the work is still running. The
         history is where it will appear, so that is what this says. -->
    <AlertBanner
      v-if="phase === 'stillProcessing'"
      variant="info"
      title="La transcripción sigue en curso"
      message="Tu archivo se ha subido correctamente y se está transcribiendo. Puedes seguir su estado desde el historial."
      data-testid="still-processing-alert"
    />

    <div
      v-if="transcription !== null"
      class="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4"
      data-testid="transcription-result"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-medium text-ink">{{ transcription.fileName }}</p>
        <StatusBadge :status="transcription.status" />
      </div>

      <p
        v-if="transcription.textPreview !== null"
        class="whitespace-pre-wrap text-sm text-ink-muted"
        data-testid="transcription-preview"
      >
        {{ transcription.textPreview }}
      </p>
    </div>
  </section>
</template>
