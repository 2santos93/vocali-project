import type { CreateUploadIntentResponse } from '@vocali/contracts';
import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import { Transcription } from '../../domain/entities/transcription.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { IdGenerator } from '../../domain/ports/id-generator.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok } from '../../domain/shared/result.js';
import type { Result } from '../../domain/types/result.js';
import { AudioFile } from '../../domain/value-objects/audio-file.js';
import { UPLOAD_URL_TTL_SECONDS } from '../constants.js';
import type { CreateAudioUploadIntentError } from '../types/transcription-errors.js';
import type { CreateAudioUploadIntentInput } from '../types/transcription-inputs.js';
import { buildAudioObjectKey } from './object-keys.js';

/**
 * The size cap is enforced by the presigned POST's `content-length-range`
 * condition, via `maxSizeBytes`, not by the client-supplied `sizeBytes`: a
 * client can lie about that number but cannot forge the signed condition.
 */
export class CreateAudioUploadIntent {
  constructor(
    private readonly repository: TranscriptionRepository,
    private readonly storage: FileStorage,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CreateAudioUploadIntentInput,
  ): Promise<Result<CreateUploadIntentResponse, CreateAudioUploadIntentError>> {
    const audioFileResult = AudioFile.create(input);
    if (!audioFileResult.success) {
      return err(audioFileResult.error);
    }

    const transcriptionId = this.idGenerator.next();
    const audioObjectKey = buildAudioObjectKey(input.userId, transcriptionId, input.fileName);

    // Presign before saving. If presigning fails nothing is persisted; if the
    // save fails the client gets a 5xx and never receives the URL, so the only
    // residue is a signed URL nobody holds. The other order strands a
    // PENDING_UPLOAD row in the user's history on every client retry.
    const upload = await this.storage.createPresignedUpload({
      objectKey: audioObjectKey,
      contentType: input.contentType,
      maxSizeBytes: MAX_AUDIO_FILE_SIZE_BYTES,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });

    const transcription = Transcription.createForFileUpload({
      id: transcriptionId,
      userId: input.userId,
      audioFile: audioFileResult.value,
      audioObjectKey,
      createdAt: this.clock.now(),
    });

    const written = await this.repository.save(transcription);
    if (!written.success) {
      // Unreachable: the record was built around an id generated moments ago,
      // so nothing else holds it and there is no earlier revision to lose to.
      // An invariant violation rather than an outcome a caller must handle.
      throw new Error(
        `Invariant violated: CreateAudioUploadIntent could not persist a newly created transcription (${written.error.message})`,
      );
    }

    return ok({
      transcriptionId,
      upload: {
        url: upload.url,
        fields: upload.fields,
        expiresAt: upload.expiresAt.toISOString(),
      },
    });
  }
}
