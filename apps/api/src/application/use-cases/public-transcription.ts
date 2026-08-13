import type { Transcription as TranscriptionDto } from '@vocali/contracts';
import type { TranscriptionPrimitives } from '../../domain/types/transcription.js';

/**
 * Maps each field by name rather than spreading `TranscriptionPrimitives`.
 * `userId`, `audioObjectKey`, `transcriptObjectKey` and `externalJobId` must
 * never reach the client, and a spread would leak the next internal field
 * added to the entity.
 */
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
