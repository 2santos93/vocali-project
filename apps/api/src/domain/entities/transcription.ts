import type { TranscriptionStatus } from '@vocali/contracts/constants';
import { InvalidStatusTransitionError } from '../errors/domain-error.js';
import { err, ok } from '../shared/result.js';
import type {
  CompletionInput,
  FileUploadInput,
  RealtimeSessionInput,
  TranscriptionPrimitives,
} from '../types/transcription.js';
import type { Result } from '../types/result.js';
import { canTransition } from '../value-objects/transcription-status.js';

const TEXT_PREVIEW_LENGTH = 200;

export class Transcription {
  private constructor(private state: TranscriptionPrimitives) {}

  static createForFileUpload(input: FileUploadInput): Transcription {
    const timestamp = input.createdAt.toISOString();

    return new Transcription({
      id: input.id,
      userId: input.userId,
      version: 0,
      fileName: input.audioFile.fileName,
      source: 'FILE',
      status: 'PENDING_UPLOAD',
      // Unknown until the provider identifies it on completion.
      language: null,
      sizeBytes: input.audioFile.sizeBytes,
      durationSeconds: null,
      audioObjectKey: input.audioObjectKey,
      transcriptObjectKey: null,
      externalJobId: null,
      textPreview: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  static createFromRealtimeSession(input: RealtimeSessionInput): Transcription {
    const timestamp = input.createdAt.toISOString();

    return new Transcription({
      id: input.id,
      userId: input.userId,
      version: 0,
      fileName: buildRealtimeFileName(input.createdAt),
      source: 'MICROPHONE',
      status: 'COMPLETED',
      language: input.language,
      sizeBytes: null,
      durationSeconds: input.durationSeconds,
      audioObjectKey: null,
      transcriptObjectKey: input.transcriptObjectKey,
      externalJobId: null,
      textPreview: buildPreview(input.text),
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  static fromPrimitives(primitives: TranscriptionPrimitives): Transcription {
    return new Transcription(primitives);
  }

  get status(): TranscriptionStatus {
    return this.state.status;
  }

  get externalJobId(): string | null {
    return this.state.externalJobId;
  }

  markAsProcessing(externalJobId: string, at: Date): Result<void, InvalidStatusTransitionError> {
    return this.transitionTo('PROCESSING', at, { externalJobId });
  }

  markAsCompleted(input: CompletionInput): Result<void, InvalidStatusTransitionError> {
    return this.transitionTo('COMPLETED', input.at, {
      transcriptObjectKey: input.transcriptObjectKey,
      durationSeconds: input.durationSeconds,
      language: input.language ?? this.state.language,
      textPreview: buildPreview(input.text),
      // FAILED -> COMPLETED is allowed, so a late success must not leave the
      // earlier failure text attached to a completed transcription.
      errorMessage: null,
    });
  }

  markAsFailed(reason: string, at: Date): Result<void, InvalidStatusTransitionError> {
    return this.transitionTo('FAILED', at, { errorMessage: reason });
  }

  toPrimitives(): TranscriptionPrimitives {
    return { ...this.state };
  }

  private transitionTo(
    status: TranscriptionStatus,
    at: Date,
    changes: Partial<TranscriptionPrimitives>,
  ): Result<void, InvalidStatusTransitionError> {
    if (!canTransition(this.state.status, status)) {
      return err(new InvalidStatusTransitionError(this.state.status, status));
    }

    this.state = { ...this.state, ...changes, status, updatedAt: at.toISOString() };
    return ok(undefined);
  }
}

function buildPreview(text: string): string {
  return text.slice(0, TEXT_PREVIEW_LENGTH);
}

/**
 * Formatted rather than the raw ISO string: that contains colons, which are
 * invalid in filenames on Windows, and this name is what the user sees and
 * downloads. `microphone-YYYYMMDD-HHmmss` still sorts in recording order.
 */
function buildRealtimeFileName(at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');

  const date = `${String(at.getUTCFullYear())}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`;
  const time = `${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`;

  return `microphone-${date}-${time}`;
}
