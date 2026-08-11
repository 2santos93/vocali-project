import type { Transcription as TranscriptionDto } from '@vocali/contracts';
import type { TranscriptionPrimitives } from '../../domain/entities/transcription.js';

/**
 * Maps each field by name rather than spreading `TranscriptionPrimitives`.
 * `userId`, `audioObjectKey`, `transcriptObjectKey` and `externalJobId` are
 * internal storage identifiers that must never reach the client; a spread
 * would leak them the moment a new internal field is added to the entity.
 *
 * It lives in its own module because every use case that returns a
 * transcription to the caller has to go through it. Leaving it inside the
 * history use case, as it originally was, meant the realtime save had no
 * obvious reason not to hand back the entity itself — and it did.
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
