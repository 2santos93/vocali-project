<script setup lang="ts">
import { MAX_AUDIO_FILE_SIZE_BYTES, SUPPORTED_AUDIO_CONTENT_TYPES } from '@vocali/contracts';
import { computed, ref } from 'vue';
import BaseButton from '../atoms/BaseButton.vue';
import type { FileRejection } from '../types';

interface Props {
  /**
   * Defaults come straight from @vocali/contracts, so the courtesy check the
   * browser performs and the policy S3 enforces are the same numbers. A
   * second copy here is how a client starts refusing files the server would
   * have accepted, or promising ones it will reject.
   */
  accept?: readonly string[];
  maxSizeBytes?: number;
  disabled?: boolean;
  /** Shown once a file has been chosen. */
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

const BYTES_PER_MEGABYTE = 1024 * 1024;

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

const fileInput = ref<HTMLInputElement | null>(null);
const isDragActive = ref(false);

const acceptAttribute = computed<string>(() => props.accept.join(','));

/*
 * Derived from the accept list rather than written out, so the formats the
 * user is told about are the formats the component will actually take.
 */
const acceptedFormatsText = computed<string>(() => {
  const labels = props.accept.map((type) => EXTENSION_LABELS[type] ?? type.toUpperCase());
  // Array.from rather than a spread: @vue/vue3-jest forces an ES5 target when
  // it transpiles an SFC, and without downlevelIteration TypeScript compiles
  // `[...set]` to `set.slice()`, which a Set does not have. It fails only
  // under test, which is the worst place for a difference to live.
  return Array.from(new Set(labels)).join(', ');
});

function formatMegabytes(bytes: number): string {
  const megabytes = bytes / BYTES_PER_MEGABYTE;
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(megabytes)} MB`;
}

const maxSizeText = computed<string>(() => formatMegabytes(props.maxSizeBytes));

/**
 * The client check is a courtesy — the presigned POST policy is what enforces
 * the limit — but it is the difference between a clear sentence now and a
 * failed upload in twenty seconds.
 */
function findRejection(file: File): FileRejection | null {
  if (!props.accept.includes(file.type)) {
    return {
      code: 'UNSUPPORTED_FORMAT',
      fileName: file.name,
      message: `El formato de «${file.name}» no es compatible. Admitimos ${acceptedFormatsText.value}.`,
    };
  }
  if (file.size === 0) {
    return {
      code: 'EMPTY_FILE',
      fileName: file.name,
      message: `«${file.name}» está vacío, así que no hay audio que transcribir.`,
    };
  }
  if (file.size > props.maxSizeBytes) {
    return {
      code: 'FILE_TOO_LARGE',
      fileName: file.name,
      message: `«${file.name}» ocupa ${formatMegabytes(file.size)} y el límite es ${maxSizeText.value}.`,
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
      'flex flex-col items-center gap-3 rounded-panel border-2 border-dashed px-6 py-10 text-center',
    ]"
    data-testid="file-drop-zone"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <p class="text-sm font-medium text-ink">Arrastra un archivo de audio aquí</p>
    <p :id="`${inputId}-help`" class="text-xs text-ink-muted">
      Formatos admitidos: {{ acceptedFormatsText }}. Tamaño máximo: {{ maxSizeText }}.
    </p>

    <!-- The input carries the real file picker; the button drives it, so the
         control is reachable by keyboard instead of by drag alone. -->
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
    <BaseButton variant="secondary" :disabled="disabled" @click="openFilePicker">
      Seleccionar archivo
    </BaseButton>

    <p v-if="selectedFileName !== null" class="text-sm text-ink" data-testid="selected-file-name">
      Archivo seleccionado: <span class="font-medium">{{ selectedFileName }}</span>
    </p>
  </div>
</template>
