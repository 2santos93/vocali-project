import type { Transcription as TranscriptionDto } from '@vocali/contracts';
import type { TranscriptionPrimitives } from '../../domain/types/transcription.js';

export function toPublicTranscription(primitives: TranscriptionPrimitives): TranscriptionDto {
  return {
    id: primitives.id,
    fileName: primitives.fileName,
    source: primitives.source,
    status: primitives.status,
    language: primitives.language,
    durationSeconds: primitives.durationSeconds,
    sizeBytes: primitives.sizeBytes,
    textPreview: primitives.textPreview,
    errorMessage: primitives.errorMessage,
    createdAt: primitives.createdAt,
    updatedAt: primitives.updatedAt,
  };
}
