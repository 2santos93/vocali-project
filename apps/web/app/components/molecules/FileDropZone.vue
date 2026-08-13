<script setup lang="ts">
import { MAX_AUDIO_FILE_SIZE_BYTES, SUPPORTED_AUDIO_CONTENT_TYPES } from '@vocali/contracts';
import { computed, ref } from 'vue';
import { useTranslations } from '../../i18n/translations';
import BaseButton from '../atoms/BaseButton.vue';
import { formatMegabytes } from '../format';
import type { FileRejection } from '../types/files';

interface Props {
  accept?: readonly string[];
  maxSizeBytes?: number;
  disabled?: boolean;
  selectedFileName?: string | null;
  inputId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  accept: () => SUPPORTED_AUDIO_CONTENT_TYPES,
  maxSizeBytes: MAX_AUDIO_FILE_SIZE_BYTES,
  disabled: false,
  selectedFileName: null,
  inputId: 'file-drop-zone-input',
});

const emit = defineEmits<{
  select: [file: File];
  reject: [rejection: FileRejection];
}>();

const EXTENSION_LABELS: Record<string, string> = {
  'audio/wav': 'WAV',
  'audio/x-wav': 'WAV',
  'audio/mpeg': 'MP3',
  'audio/mp4': 'M4A',
  'audio/aac': 'AAC',
  'audio/ogg': 'OGG',
  'audio/flac': 'FLAC',
  'audio/amr': 'AMR',
  'video/mp4': 'MP4',
};

const { t, locale } = useTranslations();

const fileInput = ref<HTMLInputElement | null>(null);
const isDragActive = ref(false);

const acceptAttribute = computed<string>(() => props.accept.join(','));

const acceptedFormatsText = computed<string>(() => {
  const labels = props.accept.map((type) => EXTENSION_LABELS[type] ?? type.toUpperCase());
  return Array.from(new Set(labels)).join(', ');
});

const maxSizeText = computed<string>(() => formatMegabytes(props.maxSizeBytes, locale.value));

/**
 * The refusal leaves as a key and its values, not a finished sentence: the
 * parent renders it, and by then the reader may have changed language.
 */
function findRejection(file: File): FileRejection | null {
  if (!props.accept.includes(file.type)) {
    return {
      code: 'UNSUPPORTED_FORMAT',
      fileName: file.name,
      message: {
        key: 'upload.rejected.format',
        values: { fileName: file.name, formats: acceptedFormatsText.value },
      },
    };
  }
  if (file.size === 0) {
    return {
      code: 'EMPTY_FILE',
      fileName: file.name,
      message: { key: 'upload.rejected.empty', values: { fileName: file.name } },
    };
  }
  if (file.size > props.maxSizeBytes) {
    return {
      code: 'FILE_TOO_LARGE',
      fileName: file.name,
      message: {
        key: 'upload.rejected.tooLarge',
        values: {
          fileName: file.name,
          size: formatMegabytes(file.size, locale.value),
          maxSize: maxSizeText.value,
        },
      },
    };
  }
  return null;
}

function offer(file: File): void {
  const rejection = findRejection(file);
  if (rejection !== null) {
    emit('reject', rejection);
    return;
  }
  emit('select', file);
}

function onDragOver(): void {
  if (props.disabled) {
    return;
  }
  isDragActive.value = true;
}

function onDragLeave(): void {
  isDragActive.value = false;
}

function onDrop(event: DragEvent): void {
  isDragActive.value = false;
  if (props.disabled) {
    return;
  }
  const file = event.dataTransfer?.files[0];
  if (file === undefined) {
    return;
  }
  offer(file);
}

function onInputChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file !== undefined) {
    offer(file);
  }
  // Choosing the same file again fires no `change` event unless the value is
  // cleared, so a user who fixes a file on disk and re-picks it gets nothing.
  input.value = '';
}

function openFilePicker(): void {
  fileInput.value?.click();
}
</script>

<template>
  <div
    :class="[
      isDragActive ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface',
      disabled ? 'opacity-60' : '',
      'flex flex-col items-center gap-2 rounded-panel border-2 border-dashed px-4 py-6 text-center transition-colors',
    ]"
    data-testid="file-drop-zone"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <svg
      class="h-7 w-7 text-ink-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4m0 0L8 8m4-4 4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>

    <p class="text-sm font-medium text-ink">{{ t('upload.dropInstruction') }}</p>
    <p :id="`${inputId}-help`" class="text-xs leading-relaxed text-ink-muted">
      {{ t('upload.limits', { formats: acceptedFormatsText, maxSize: maxSizeText }) }}
    </p>

    <!-- The button drives this input, so the zone is reachable by keyboard
         rather than by drag alone. -->
    <input
      :id="inputId"
      ref="fileInput"
      type="file"
      class="hidden"
      :accept="acceptAttribute"
      :disabled="disabled"
      :aria-describedby="`${inputId}-help`"
      data-testid="file-input"
      @change="onInputChange"
    />
    <BaseButton variant="secondary" size="sm" :disabled="disabled" @click="openFilePicker">
      {{ t('upload.choose') }}
    </BaseButton>

    <p
      v-if="selectedFileName !== null"
      class="mt-1 w-full break-all border-t border-line pt-3 text-sm text-ink"
      data-testid="selected-file-name"
    >
      {{ t('upload.selected') }} <span class="font-medium">{{ selectedFileName }}</span>
    </p>
  </div>
</template>
