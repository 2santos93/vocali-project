import type { TranscriptionLanguage } from '@vocali/contracts/constants';
import type { TranscriptFormat } from '@vocali/contracts';

export interface CreateAudioUploadIntentInput {
  readonly userId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface StartFileTranscriptionInput {
  readonly audioObjectKey: string;
}

export interface StartFileTranscriptionConfig {
  readonly callbackBaseUrl: string;
}

export interface CompleteTranscriptionInput {
  readonly userId: string;
  readonly transcriptionId: string;
  readonly externalJobId: string;
  readonly text: string;
  readonly durationSeconds: number;
  readonly language: TranscriptionLanguage | null;
}

export interface FailTranscriptionInput {
  readonly userId: string;
  readonly transcriptionId: string;
  readonly externalJobId: string;
  readonly reason: string;
}

export interface GetTranscriptionInput {
  readonly userId: string;
  readonly transcriptionId: string;
}

export interface ListUserTranscriptionsInput {
  readonly userId: string;
  readonly cursor: string | null;
}

export interface GetTranscriptionDownloadUrlInput {
  readonly userId: string;
  readonly transcriptionId: string;
  readonly format: TranscriptFormat;
}

export interface SaveRealtimeTranscriptionInput {
  readonly userId: string;
  readonly text: string;
  readonly durationSeconds: number;
  readonly language: TranscriptionLanguage;
  readonly clientSessionId?: string | undefined;
}
