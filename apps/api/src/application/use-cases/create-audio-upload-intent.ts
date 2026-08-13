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
