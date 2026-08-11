import type {
  ListTranscriptionsResponse,
  Transcription as TranscriptionDto,
} from '@vocali/contracts';
import { TRANSCRIPTION_PAGE_SIZE } from '@vocali/contracts';
import type { TranscriptionPrimitives } from '../../domain/entities/transcription.js';
import type { InvalidCursorError } from '../../domain/errors/domain-error.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import type { Result } from '../../domain/shared/result.js';
import { ok } from '../../domain/shared/result.js';

interface ListUserTranscriptionsInput {
  readonly userId: string;
  readonly cursor: string | null;
}

export class ListUserTranscriptions {
  constructor(private readonly repository: TranscriptionRepository) {}

  async execute(
    input: ListUserTranscriptionsInput,
  ): Promise<Result<ListTranscriptionsResponse, InvalidCursorError>> {
    const page = await this.repository.listByUser({
      userId: input.userId,
      limit: TRANSCRIPTION_PAGE_SIZE,
      cursor: input.cursor,
    });
    if (!page.success) {
      return page;
    }

    return ok({
      items: page.value.items.map(toPublicTranscription),
      nextCursor: page.value.nextCursor,
    });
  }
}

/**
 * Maps each field by name rather than spreading `TranscriptionPrimitives`.
 * `userId`, `audioObjectKey`, `transcriptObjectKey` and `externalJobId` are
 * internal storage identifiers that must never reach the client; a spread
 * would leak them the moment a new internal field is added to the entity.
 */
function toPublicTranscription(primitives: TranscriptionPrimitives): TranscriptionDto {
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
