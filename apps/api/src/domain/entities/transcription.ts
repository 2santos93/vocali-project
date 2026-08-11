import type { TranscriptionSource, TranscriptionStatus } from '@vocali/contracts';
import { InvalidStatusTransitionError } from '../errors/domain-error.js';
import { err, ok, type Result } from '../shared/result.js';
import type { AudioFile } from '../value-objects/audio-file.js';
import { canTransition } from '../value-objects/transcription-status.js';

const TEXT_PREVIEW_LENGTH = 200;

export interface TranscriptionPrimitives {
  readonly id: string;
  readonly userId: string;
  readonly fileName: string;
  readonly source: TranscriptionSource;
  readonly status: TranscriptionStatus;
  readonly language: string;
  readonly sizeBytes: number | null;
  readonly durationSeconds: number | null;
  readonly audioObjectKey: string | null;
  readonly transcriptObjectKey: string | null;
  readonly externalJobId: string | null;
  readonly textPreview: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface FileUploadInput {
  readonly id: string;
  readonly userId: string;
  readonly audioFile: AudioFile;
  readonly audioObjectKey: string;
  readonly language: string;
  readonly createdAt: Date;
}

interface RealtimeSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly language: string;
  readonly durationSeconds: number;
  readonly transcriptObjectKey: string;
  readonly text: string;
  readonly createdAt: Date;
}

interface CompletionInput {
  readonly transcriptObjectKey: string;
  readonly text: string;
  readonly durationSeconds: number;
  readonly at: Date;
}

export class Transcription {
  private constructor(private state: TranscriptionPrimitives) {}

  static createForFileUpload(input: FileUploadInput): Transcription {
    const timestamp = input.createdAt.toISOString();

    return new Transcription({
      id: input.id,
      userId: input.userId,
      fileName: input.audioFile.fileName,
      source: 'FILE',
      status: 'PENDING_UPLOAD',
      language: input.language,
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
      fileName: `microphone-${timestamp}`,
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
      textPreview: buildPreview(input.text),
      // A late success following a recorded FAILED status (see
      // `transcription-status.ts`) must not leave the earlier failure text
      // attached to what is now a completed transcription.
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
