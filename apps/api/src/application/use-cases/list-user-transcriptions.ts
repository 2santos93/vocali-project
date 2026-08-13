import type { ListTranscriptionsResponse } from '@vocali/contracts';
import { TRANSCRIPTION_PAGE_SIZE } from '@vocali/contracts';
import type { InvalidCursorError } from '../../domain/errors/domain-error.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import type { Result } from '../../domain/types/result.js';
import { ok } from '../../domain/shared/result.js';
import type { ListUserTranscriptionsInput } from '../types/list-user-transcriptions-input.js';
import { toPublicTranscription } from './public-transcription.js';

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
