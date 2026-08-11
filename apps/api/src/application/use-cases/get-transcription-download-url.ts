import type { DownloadUrlResponse, TranscriptFormat } from '@vocali/contracts';
import {
  TranscriptionNotFoundError,
  TranscriptionNotReadyError,
} from '../../domain/errors/domain-error.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import { buildTranscriptObjectKey } from './object-keys.js';

/** How long a download link stays valid before the client must request a new one. */
const DOWNLOAD_URL_TTL_SECONDS = 900;

interface GetTranscriptionDownloadUrlInput {
  readonly userId: string;
  readonly transcriptionId: string;
  readonly format: TranscriptFormat;
}

type GetTranscriptionDownloadUrlError = TranscriptionNotFoundError | TranscriptionNotReadyError;

export class GetTranscriptionDownloadUrl {
  constructor(
    private readonly repository: TranscriptionRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(
    input: GetTranscriptionDownloadUrlInput,
  ): Promise<Result<DownloadUrlResponse, GetTranscriptionDownloadUrlError>> {
    const transcription = await this.repository.findById(input.userId, input.transcriptionId);
    if (transcription === null) {
      // `findById` is scoped by userId, so this also covers a record that
      // belongs to another user. Returning the same error for "absent" and
      // "not yours" keeps the response from being usable to enumerate other
      // users' transcription ids.
      return err(new TranscriptionNotFoundError(input.transcriptionId));
    }

    if (transcription.status !== 'COMPLETED') {
      return err(new TranscriptionNotReadyError(transcription.status));
    }

    const objectKey = buildTranscriptObjectKey(input.userId, input.transcriptionId, input.format);
    const url = await this.storage.createPresignedDownload({
      objectKey,
      downloadFileName: `${input.transcriptionId}.${input.format}`,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    });

    return ok({
      url,
      format: input.format,
      expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1_000).toISOString(),
    });
  }
}
