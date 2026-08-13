<script setup lang="ts">
import type { Transcription } from '@vocali/contracts';
import { computed, ref } from 'vue';
import BaseButton from '../atoms/BaseButton.vue';
import ProgressBar from '../atoms/ProgressBar.vue';
import SpinnerIcon from '../atoms/SpinnerIcon.vue';
import StatusBadge from '../atoms/StatusBadge.vue';
import AlertBanner from '../molecules/AlertBanner.vue';
import FileDropZone from '../molecules/FileDropZone.vue';
import type { FileRejection } from '../types/FileRejection';
import type { FileUploadFailure } from '../../composables/types/FileUploadFailure';
import type { FileUploadPhase } from '../../composables/types/FileUploadPhase';
import type { TranslatableMessage } from '../../i18n/types/TranslatableMessage';
import { useTranslations } from '../../i18n/translations';
import { transcriptionLanguageName } from '../transcription-languages';

/**
 * This screen deliberately does not ask which language the recording is in.
 * The provider identifies that from the audio, which is the one party here
 * that has heard it — whoever uploads a file may not have made the recording,
 * and a dropdown defaulted to Spanish was answered wrongly in silence.
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
  submit: [file: File];
  reset: [];
}>();

const { t } = useTranslations();

const selectedFile = ref<File | null>(null);

/**
 * A key rather than a sentence, so a warning raised before a change of
 * language is still read in the language on screen.
 */
const warning = ref<TranslatableMessage | null>(null);

/**
 * Null covers both "no record yet" and "the provider could not identify it",
 * because the screen says nothing in either case: "language unknown" beside a
 * finished transcript gives a non-event a headline.
 */
const detectedLanguage = computed<string | null>(() => {
  const code = props.transcription?.language ?? null;
  return code === null ? null : transcriptionLanguageName(t, code);
});

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

/**
 * The button stays operable with no file chosen and says why it cannot
 * proceed: a disabled control explains nothing to someone who has not noticed
 * that the drop zone rejected their file.
 */
function onSubmit(): void {
  const file = selectedFile.value;
  if (file === null) {
    warning.value = { key: 'file.chooseFirst' };
    return;
  }
  warning.value = null;
  emit('submit', file);
}

function onReset(): void {
  selectedFile.value = null;
  warning.value = null;
  emit('reset');
}
</script>

<template>
  <section
    class="overflow-hidden rounded-panel border border-line bg-surface"
    aria-labelledby="file-transcription-heading"
  >
    <!-- Repeated from the page's <h1> because the section is named by it. -->
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

        <p class="text-xs leading-relaxed text-ink-muted" data-testid="automatic-language-note">
          {{ t('file.automaticLanguage') }}
        </p>

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

        <!-- Only while the file is on its way: a bar during the transcription
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
             the storage policy is what actually enforces the limit. -->
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

        <!-- Not an error: the audio is stored and the work is still running. -->
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

            <div class="flex items-center gap-2">
              <!-- A reader who expected another language has to see that here
                   rather than by reading the transcript and wondering. -->
              <span
                v-if="detectedLanguage !== null"
                class="text-xs text-ink-muted"
                data-testid="detected-language"
              >
                {{ t('file.detectedLanguage', { language: detectedLanguage }) }}
              </span>

              <StatusBadge :status="transcription.status" />
            </div>
          </div>

          <p
            v-if="transcription.textPreview !== null"
            class="whitespace-pre-wrap text-base leading-relaxed text-ink"
            data-testid="transcription-preview"
          >
            {{ transcription.textPreview }}
          </p>
        </div>

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
