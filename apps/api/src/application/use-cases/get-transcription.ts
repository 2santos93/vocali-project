import type { Transcription as TranscriptionDto } from '@vocali/contracts';
import { TranscriptionNotFoundError } from '../../domain/errors/domain-error.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import { toPublicTranscription } from './public-transcription.js';

interface GetTranscriptionInput {
  readonly userId: string;
  readonly transcriptionId: string;
}

/**
 * Reads one transcription for the client that is polling it.
 *
 * The file pipeline is asynchronous — upload, S3 event, provider job,
 * callback — so a client that has just uploaded has no way to learn the
 * outcome except by asking. Paging the whole history to find one record would
 * work only until the record fell off the first page.
 *
 * `findById` is scoped by `userId`, so another user's id addresses an item
 * that does not exist rather than one this use case has to remember to
 * filter. Absent and not-yours produce the same error for the same reason
 * they do on the download path: a distinguishable response is an oracle for
 * which transcription ids exist.
 */
export class GetTranscription {
  constructor(private readonly repository: TranscriptionRepository) {}

  async execute(
    input: GetTranscriptionInput,
  ): Promise<Result<TranscriptionDto, TranscriptionNotFoundError>> {
    const transcription = await this.repository.findById(input.userId, input.transcriptionId);
    if (transcription === null) {
      return err(new TranscriptionNotFoundError(input.transcriptionId));
    }

    // The public DTO, never the primitives: `toPrimitives()` carries the
    // owning `userId` and three internal object keys.
    return ok(toPublicTranscription(transcription.toPrimitives()));
  }
}
