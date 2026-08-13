import type { CreateUploadIntentResponse } from '@vocali/contracts';
import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import { Transcription } from '../../domain/entities/transcription.js';
import type {
  AudioFileTooLargeError,
  InvalidAudioFileNameError,
  InvalidAudioFileSizeError,
  UnsupportedAudioFormatError,
} from '../../domain/errors/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { IdGenerator } from '../../domain/ports/id-generator.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import { AudioFile } from '../../domain/value-objects/audio-file.js';
import { UPLOAD_URL_TTL_SECONDS } from '../constants.js';
import { buildAudioObjectKey } from './object-keys.js';

interface CreateAudioUploadIntentInput {
  readonly userId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

type CreateAudioUploadIntentError =
  | UnsupportedAudioFormatError
  | InvalidAudioFileSizeError
  | AudioFileTooLargeError
  | InvalidAudioFileNameError;

/**
 * Issues a presigned upload for a new file-based transcription and persists
 * it as `PENDING_UPLOAD`.
 *
 * The 20 MB cap is enforced by the presigned POST's `content-length-range`
 * condition (via `maxSizeBytes`), not by trusting the client-supplied
 * `sizeBytes` in the request body — a client can lie about that number, but
 * it cannot forge the signed condition S3 checks at upload time.
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

    // Presign before saving: if presigning fails, nothing is persisted and
    // the client just retries — no stranded row. If save then fails instead,
    // the client never receives this response (a 5xx propagates from the
    // exception), so the only residue is a signed URL nobody holds. Either
    // order leaves some residue on the *other* failure; this one leaves
    // nothing to clean up on the failure that is easier to hit in practice.
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
      // Unreachable: this record was built around an id generated moments ago,
      // so nothing else can hold it and there is no earlier revision to lose a
      // race against. An invariant violation rather than an outcome a caller
      // must handle, so it throws — see `StartFileTranscription` for the full
      // reasoning behind that choice.
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
