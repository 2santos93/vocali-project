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
import type { FileRejection, SelectOption } from '../types';
import type { FileUploadFailure, FileUploadPhase } from '../../composables/upload-failures';
import type { TranslatableMessage } from '../../i18n/translate';
import { useTranslations } from '../../i18n/translations';
import { transcriptionLanguageOptions, toTranscriptionLanguage } from '../transcription-languages';

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

const { t } = useTranslations();

const selectedFile = ref<File | null>(null);
const language = ref<TranscriptionLanguage>(DEFAULT_TRANSCRIPTION_LANGUAGE);

const languageOptions = computed<readonly SelectOption[]>(() => transcriptionLanguageOptions(t));

/**
 * Why the panel cannot proceed yet — a refused file, or no file at all.
 *
 * Held as a message rather than as a code because every producer of it already
 * knows which one applies: `FileDropZone` owns the limits it checked and names
 * its own refusal, and there is exactly one other case. It is a key rather
 * than a sentence so that a warning raised before a change of language is
 * still read in the language on screen.
 */
const warning = ref<TranslatableMessage | null>(null);

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
    warning.value = { key: 'file.chooseFirst' };
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
  <!--
    The same two columns as the dictation screen, and for the same reason: what
    the user provides on the left, what comes back on the right, with one rule
    between them. Reading them as one shape across both screens is worth more
    than either arrangement is on its own.
  -->
  <section
    class="overflow-hidden rounded-panel border border-line bg-surface"
    aria-labelledby="file-transcription-heading"
  >
    <!-- The page's <h1> already says this. Kept as the section's name, and
         hidden, rather than printed twice. -->
    <h2 id="file-transcription-heading" class="sr-only">{{ t('file.heading') }}</h2>

    <div class="grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div class="flex flex-col gap-5 border-b border-line p-5 lg:border-b-0 lg:border-r lg:p-6">
        <FileDropZone
          input-id="audio-file"
          :disabled="isBusy"
          :selected-file-name="selectedFileName"
          @select="onSelect"
          @reject="onReject"
        />

        <FormField id="audio-language" :label="t('file.language')" :hint="t('file.languageHint')">
          <template #default="{ id, describedBy }">
            <BaseSelect
              :id="id"
              :model-value="language"
              :options="languageOptions"
              :disabled="isBusy"
              :described-by="describedBy"
              @update:model-value="onLanguageChange"
            />
          </template>
        </FormField>

        <div class="flex flex-col gap-2">
          <BaseButton
            block
            size="lg"
            :disabled="isBusy"
            :loading="isBusy"
            :loading-label="t('file.submitting')"
            data-testid="submit-button"
            @click="onSubmit"
          >
            {{ t('file.submit') }}
          </BaseButton>

          <BaseButton
            v-if="isFinished"
            block
            variant="secondary"
            data-testid="reset-button"
            @click="onReset"
          >
            {{ t('file.again') }}
          </BaseButton>
        </div>

        <!-- Real progress, from XMLHttpRequest's progress event. It is shown
             only while the file is on its way: a bar during the transcription
             itself would be measuring nothing. -->
        <ProgressBar
          v-if="phase === 'uploading'"
          :value="progress"
          :label="t('file.uploading')"
          data-testid="upload-progress"
        />

        <p
          v-if="phase === 'requesting'"
          class="flex items-center gap-2 text-sm text-ink-muted"
          role="status"
        >
          <SpinnerIcon :label="t('file.preparing')" />
          {{ t('file.preparingNotice') }}
        </p>

        <p
          v-if="phase === 'processing'"
          class="flex items-center gap-2 text-sm text-ink-muted"
          role="status"
          data-testid="processing-notice"
        >
          <SpinnerIcon :label="t('file.submitting')" />
          {{ t('file.processingNotice') }}
        </p>

        <!-- A warning rather than an error: nothing has been attempted yet, and
             the client-side checks are a courtesy — the storage policy is what
             enforces the limit. It sits under the controls it is about, so the
             refused file and the reason are read together. -->
        <AlertBanner
          v-if="warning !== null"
          variant="warning"
          :message="t(warning)"
          data-testid="rejection-alert"
        />

        <AlertBanner
          v-if="failure !== null"
          variant="error"
          :title="t('file.failureTitle')"
          :message="t(failure.message)"
          data-testid="failure-alert"
        />
      </div>

      <div class="flex min-w-0 flex-col gap-3 bg-surface-muted p-5 lg:p-6">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {{ t('file.resultHeading') }}
        </h3>

        <!-- Not an error: the audio is stored and the work is still running.
             The history is where it will appear, so that is what this says. -->
        <AlertBanner
          v-if="phase === 'stillProcessing'"
          variant="info"
          :title="t('file.stillProcessingTitle')"
          :message="t('file.stillProcessingMessage')"
          data-testid="still-processing-alert"
        />

        <div
          v-if="transcription !== null"
          class="flex min-h-64 flex-col gap-3 lg:min-h-80"
          data-testid="transcription-result"
        >
          <div
            class="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-line bg-surface px-4 py-3"
          >
            <p class="text-sm font-medium text-ink">{{ transcription.fileName }}</p>
            <StatusBadge :status="transcription.status" />
          </div>

          <p
            v-if="transcription.textPreview !== null"
            class="whitespace-pre-wrap text-base leading-relaxed text-ink"
            data-testid="transcription-preview"
          >
            {{ transcription.textPreview }}
          </p>
        </div>

        <!-- The column has to say something before there is a result, or the
             larger half of the screen is an unexplained empty space. -->
        <p
          v-else
          class="min-h-64 text-sm text-ink-muted lg:min-h-80"
          data-testid="result-placeholder"
        >
          {{ t('file.resultPlaceholder') }}
        </p>
      </div>
    </div>
  </section>
</template>
