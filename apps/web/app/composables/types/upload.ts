import type { TranslatableMessage } from '../../i18n/types';
import type {
  CreateUploadIntentRequest,
  CreateUploadIntentResponse,
  Transcription,
} from '@vocali/contracts';
import type { SettlementWatchGateway } from './settlement';
import type { ComputedRef, DeepReadonly, Ref } from 'vue';

export type FileUploadPhase =
  | 'idle'
  | 'requesting'
  | 'uploading'
  | 'processing'
  /** Transcribed and stored. */
  | 'completed'
  /** The attempt ended badly; `failure` says how. */
  | 'failed'
  /**
   * Uploaded and accepted, but still being transcribed when the watch budget
   * ran out. Distinct from `failed` because nothing went wrong.
   */
  | 'stillProcessing';

export type FileUploadFailureCode =
  | 'SESSION_EXPIRED'
  | 'UNSUPPORTED_FORMAT'
  | 'INTENT_REFUSED'
  | 'STORAGE_REFUSED'
  | 'NETWORK_FAILED'
  | 'TRANSCRIPTION_FAILED';

export interface FileUploadFailure {
  readonly code: FileUploadFailureCode;
  /** Phrased so it says what to do next. */
  readonly message: TranslatableMessage;
}

export type StorageUploadFailureCode = 'REFUSED' | 'NETWORK_FAILED' | 'ABORTED';

export interface FailureDetail {
  readonly code: string | null;
  readonly message: string | null;
}

export interface PresignedPostUpload {
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly file: File;
  readonly onProgress?: (percentage: number) => void;
}

/**
 * Extends what the settle watch needs rather than restating it, so the two
 * cannot drift: the page supplies one object and both halves read from it.
 */
export interface FileUploadGateway extends SettlementWatchGateway {
  createUploadIntent(request: CreateUploadIntentRequest): Promise<CreateUploadIntentResponse>;
  uploadToStorage(upload: PresignedPostUpload): Promise<void>;
}

export interface FileUploadController {
  readonly phase: DeepReadonly<Ref<FileUploadPhase>>;
  readonly progress: DeepReadonly<Ref<number>>;
  readonly failure: DeepReadonly<Ref<FileUploadFailure | null>>;
  readonly transcription: DeepReadonly<Ref<Transcription | null>>;
  readonly isBusy: ComputedRef<boolean>;
  /*
   * Properties holding functions rather than methods: they are closures with
   * no `this`, so a page may destructure them off the controller.
   */
  readonly upload: (file: File) => Promise<void>;
  readonly reset: () => void;
}
