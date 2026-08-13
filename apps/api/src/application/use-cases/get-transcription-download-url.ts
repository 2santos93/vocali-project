import type { DownloadUrlResponse } from '@vocali/contracts';
import {
  TranscriptionNotFoundError,
  TranscriptionNotReadyError,
} from '../../domain/errors/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok } from '../../domain/shared/result.js';
import type { Result } from '../../domain/types/result.js';
import { DOWNLOAD_URL_TTL_SECONDS } from '../constants.js';
import type { GetTranscriptionDownloadUrlError } from '../types/transcription-errors.js';
import type { GetTranscriptionDownloadUrlInput } from '../types/transcription-inputs.js';
import { buildTranscriptObjectKey } from './object-keys.js';

export class GetTranscriptionDownloadUrl {
  constructor(
    private readonly repository: TranscriptionRepository,
    private readonly storage: FileStorage,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: GetTranscriptionDownloadUrlInput,
  ): Promise<Result<DownloadUrlResponse, GetTranscriptionDownloadUrlError>> {
    const transcription = await this.repository.findById(input.userId, input.transcriptionId);
    if (transcription === null) {
      // `findById` is scoped by userId, so this also covers another user's
      // record. The same error for "absent" and "not yours" keeps the response
      // from being usable to enumerate transcription ids.
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
      expiresAt: new Date(
        this.clock.now().getTime() + DOWNLOAD_URL_TTL_SECONDS * 1_000,
      ).toISOString(),
    });
  }
}
