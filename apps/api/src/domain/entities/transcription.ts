import type {
  TranscriptionLanguage,
  TranscriptionSource,
  TranscriptionStatus,
} from '@vocali/contracts/constants';
import { InvalidStatusTransitionError } from '../errors/domain-error.js';
import { err, ok, type Result } from '../shared/result.js';
import type { AudioFile } from '../value-objects/audio-file.js';
import { canTransition } from '../value-objects/transcription-status.js';

const TEXT_PREVIEW_LENGTH = 200;

export interface TranscriptionPrimitives {
  readonly id: string;
  readonly userId: string;
  /**
   * The revision this entity was read at, and the value every write is
   * conditioned on. `0` means the record has never been stored, so its first
   * write is an insert. Mutating the entity deliberately does not touch it:
   * a use case may apply two transitions before saving once, and what the
   * write has to match is the revision the store held when it was read, not
   * the number of changes made to it since.
   */
  readonly version: number;
  readonly fileName: string;
  readonly source: TranscriptionSource;
  readonly status: TranscriptionStatus;
  /**
   * The language of the audio, once it is known. Null on an uploaded file
   * until the provider identifies it and the completion webhook records it; a
   * dictation carries the speaker's choice from the moment it is created.
   */
  readonly language: TranscriptionLanguage | null;
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
  readonly createdAt: Date;
}

interface RealtimeSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly language: TranscriptionLanguage;
  readonly durationSeconds: number;
  readonly transcriptObjectKey: string;
  readonly text: string;
  readonly createdAt: Date;
}

interface CompletionInput {
  readonly transcriptObjectKey: string;
  readonly text: string;
  readonly durationSeconds: number;
  /**
   * The language the provider identified, where it could. Null leaves whatever
   * the record already held: a completion that failed to identify anything
   * must not erase a language, and on an upload there was none to erase.
   */
  readonly language: TranscriptionLanguage | null;
  readonly at: Date;
}

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
      // Unknown until the provider says so. See `CompletionInput`.
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

/**
 * A microphone session has no uploaded file, but the history list still shows
 * a name per row, so one is derived from the moment of recording. Formatted
 * rather than using the raw ISO string: that contains colons, which are
 * invalid in filenames on Windows, and it is what the user sees in a clinical
 * history list. `microphone-YYYYMMDD-HHmmss` sorts in recording order as
 * plain text, and the single hyphen separates date from time unambiguously.
 */
function buildRealtimeFileName(at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');

  const date = `${String(at.getUTCFullYear())}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`;
  const time = `${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`;

  return `microphone-${date}-${time}`;
}
