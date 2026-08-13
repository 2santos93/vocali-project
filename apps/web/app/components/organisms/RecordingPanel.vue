<script setup lang="ts">
import { DEFAULT_TRANSCRIPTION_LANGUAGE } from '@vocali/contracts';
import type { Transcription, TranscriptionLanguage } from '@vocali/contracts';
import { computed, ref } from 'vue';
import BaseButton from '../atoms/BaseButton.vue';
import BaseSelect from '../atoms/BaseSelect.vue';
import SpinnerIcon from '../atoms/SpinnerIcon.vue';
import StatusBadge from '../atoms/StatusBadge.vue';
import AlertBanner from '../molecules/AlertBanner.vue';
import FormField from '../molecules/FormField.vue';
import type { RecordingFailure, RecordingPhase } from '../../composables/useAudioRecorder';
import { useTranslations } from '../../i18n/translations';
import type { SelectOption } from '../types';
import { transcriptionLanguageOptions, toTranscriptionLanguage } from '../transcription-languages';

/**
 * Dictating into the microphone and watching the words appear.
 *
 * Pure Vue. The recorder's state arrives as props; starting, stopping,
 * recovering and discarding leave as events.
 */

interface Props {
  phase: RecordingPhase;
  /** What the provider has confirmed. */
  finalText: string;
  /** The provisional tail, which the provider may still revise. */
  partialText: string;
  failure?: RecordingFailure | null;
  /** True when a failure left text behind that is still worth saving. */
  hasRecoverableText?: boolean;
  transcription?: Transcription | null;
}

const props = withDefaults(defineProps<Props>(), {
  failure: null,
  hasRecoverableText: false,
  transcription: null,
});

const emit = defineEmits<{
  start: [language: TranscriptionLanguage];
  stop: [];
  saveRecovered: [];
  discard: [];
}>();

const { t } = useTranslations();

const language = ref<TranscriptionLanguage>(DEFAULT_TRANSCRIPTION_LANGUAGE);

const languageOptions = computed<readonly SelectOption[]>(() => transcriptionLanguageOptions(t));

const isLive = computed<boolean>(() => props.phase === 'connecting' || props.phase === 'recording');

const isBusy = computed<boolean>(
  () => isLive.value || props.phase === 'finishing' || props.phase === 'saving',
);

const hasText = computed<boolean>(() => props.finalText !== '' || props.partialText !== '');

/*
 * A recoverable failure is rendered as a warning rather than an error.
 *
 * Both interrupt a screen reader, but the colour and the wording are the
 * difference between "your dictation is gone" and "your dictation is safe,
 * press this". The message itself says the text is not lost; making it scarlet
 * would contradict it.
 */
const failureVariant = computed<'warning' | 'error'>(() =>
  props.failure?.recoverable === true ? 'warning' : 'error',
);

function onLanguageChange(value: string): void {
  const chosen = toTranscriptionLanguage(value);
  if (chosen !== null) {
    language.value = chosen;
  }
}

function onStart(): void {
  emit('start', language.value);
}

function onStop(): void {
  emit('stop');
}

function onSaveRecovered(): void {
  emit('saveRecovered');
}

function onDiscard(): void {
  emit('discard');
}
</script>

<template>
  <section class="flex flex-col gap-5" aria-labelledby="recording-heading">
    <h2 id="recording-heading" class="text-lg font-semibold text-ink">
      {{ t('dictation.heading') }}
    </h2>

    <AlertBanner
      v-if="failure !== null"
      :variant="failureVariant"
      :title="t('dictation.failureTitle')"
      :message="t(failure.message)"
      data-testid="failure-alert"
    />

    <AlertBanner
      v-if="phase === 'saved'"
      variant="success"
      :message="t('dictation.saved')"
      data-testid="saved-alert"
    />

    <FormField
      id="dictation-language"
      :label="t('dictation.language')"
      :hint="t('dictation.languageHint')"
    >
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

    <!-- Every control is a real button, so the whole screen works from the
         keyboard. A recording control that answers only to a mouse is not
         finished. -->
    <div class="flex flex-wrap items-center gap-3">
      <BaseButton
        v-if="!isLive"
        :loading="phase === 'finishing' || phase === 'saving'"
        :loading-label="t('dictation.savingDictation')"
        data-testid="start-button"
        @click="onStart"
      >
        {{ t('dictation.start') }}
      </BaseButton>

      <BaseButton v-else variant="danger" data-testid="stop-button" @click="onStop">
        {{ t('dictation.stop') }}
      </BaseButton>

      <!-- The recovery route out of a dropped socket. Prominent on purpose:
           losing a clinician's dictation is the worst thing this screen can
           do, so the way to keep it is a primary action, not a footnote. -->
      <BaseButton
        v-if="hasRecoverableText"
        :loading="phase === 'saving'"
        :loading-label="t('dictation.savingDictation')"
        data-testid="save-recovered-button"
        @click="onSaveRecovered"
      >
        {{ t('dictation.saveRecovered') }}
      </BaseButton>

      <BaseButton
        v-if="hasText && !isBusy"
        variant="ghost"
        data-testid="discard-button"
        @click="onDiscard"
      >
        {{ t('dictation.discard') }}
      </BaseButton>
    </div>

    <p
      v-if="phase === 'preparing' || phase === 'connecting'"
      class="flex items-center gap-2 text-sm text-ink-muted"
      role="status"
      data-testid="connecting-notice"
    >
      <SpinnerIcon :label="t('dictation.connecting')" />
      {{ t('dictation.connectingNotice') }}
    </p>

    <p
      v-if="phase === 'recording'"
      class="flex items-center gap-2 text-sm font-medium text-danger-ink"
      role="status"
      data-testid="recording-indicator"
    >
      <span class="h-2.5 w-2.5 animate-pulse rounded-full bg-danger-solid" aria-hidden="true" />
      {{ t('dictation.recording') }}
    </p>

    <p
      v-if="phase === 'finishing'"
      class="flex items-center gap-2 text-sm text-ink-muted"
      role="status"
      data-testid="finishing-notice"
    >
      <SpinnerIcon :label="t('dictation.finishing')" />
      {{ t('dictation.finishingNotice') }}
    </p>

    <p
      v-if="phase === 'saving'"
      class="flex items-center gap-2 text-sm text-ink-muted"
      role="status"
      data-testid="saving-notice"
    >
      <SpinnerIcon :label="t('dictation.saving')" />
      {{ t('dictation.savingNotice') }}
    </p>

    <div class="min-h-40 rounded-panel border border-line bg-surface p-4" data-testid="transcript">
      <p v-if="!hasText" class="text-sm text-ink-muted" data-testid="transcript-placeholder">
        {{ t('dictation.placeholder') }}
      </p>

      <p v-else class="text-base leading-relaxed">
        <!-- Confirmed text is the only part announced. The provisional tail is
             rewritten several times a second, and putting that in a live region
             makes a screen reader unusable. -->
        <span aria-live="polite" class="text-ink" data-testid="final-text">{{ finalText }}</span>

        <!--
          The visual distinction that keeps the interface honest: a partial
          rendered like a final reads as the system contradicting itself the
          moment it is revised. Muted and italic, and never only colour — the
          slant survives a monochrome screen, and the legend below says what it
          means for anyone the styling does not reach.
        -->
        <span v-if="partialText !== ''" class="italic text-ink-muted" data-testid="partial-text">
          {{ partialText }}
        </span>
      </p>
    </div>

    <p v-if="partialText !== ''" class="text-xs text-ink-muted" data-testid="partial-legend">
      {{ t('dictation.partialLegend') }}
    </p>

    <div
      v-if="transcription !== null"
      class="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-line bg-surface p-4"
      data-testid="transcription-result"
    >
      <p class="text-sm font-medium text-ink">{{ transcription.fileName }}</p>
      <StatusBadge :status="transcription.status" />
    </div>
  </section>
</template>
