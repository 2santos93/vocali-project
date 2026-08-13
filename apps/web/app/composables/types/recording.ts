import type { TranslatableMessage } from '../../i18n/types';
import type {
  RealtimeSessionResponse,
  SaveRealtimeTranscriptionRequest,
  Transcription,
  TranscriptionLanguage,
} from '@vocali/contracts';
import type { AudioCapture } from './audio';
import type { ComputedRef, DeepReadonly, Ref } from 'vue';

export type RecordingPhase =
  | 'idle'
  /** Minting the provider session. */
  | 'preparing'
  /** Socket open, waiting for the provider to acknowledge `StartRecognition`. */
  | 'connecting'
  | 'recording'
  /** `EndOfStream` sent, waiting for the last words. */
  | 'finishing'
  | 'saving'
  | 'saved'
  | 'failed';

export type RecordingFailureCode =
  | 'MICROPHONE_DENIED'
  | 'MICROPHONE_UNAVAILABLE'
  | 'SESSION_UNAVAILABLE'
  | 'SESSION_EXPIRED'
  | 'CONNECTION_LOST'
  | 'PROVIDER_QUOTA_EXCEEDED'
  | 'PROVIDER_FAILED'
  | 'NOTHING_TO_SAVE'
  | 'SAVE_FAILED';

export interface RecordingFailure {
  readonly code: RecordingFailureCode;
  /** Which sentence to show; which catalogue is decided where it is rendered. */
  readonly message: TranslatableMessage;
  /**
   * Whether transcribed text is still on screen for the user to save. Losing a
   * dictation to a dropped socket is the worst thing this screen can do, so a
   * failure leaving text behind is a recovery offer, not a dead end.
   */
  readonly recoverable: boolean;
}

export type MicrophoneFailureCode = 'PERMISSION_DENIED' | 'NO_MICROPHONE' | 'CAPTURE_FAILED';

export interface ProviderFrame {
  readonly name: string;
  readonly payload: unknown;
}

export interface AudioRecorderDependencies {
  /** Mints the short-lived provider credential. */
  createSession(): Promise<RealtimeSessionResponse>;
  /** Stores the finished dictation. */
  saveTranscription(request: SaveRealtimeTranscriptionRequest): Promise<Transcription>;
  capture: AudioCapture;
  createSocket(url: string): WebSocket;
  now(): number;
  wait(milliseconds: number): Promise<void>;
}

export interface AudioRecorderController {
  readonly phase: DeepReadonly<Ref<RecordingPhase>>;
  /** Everything the provider has confirmed. Rendered as settled text. */
  readonly finalText: DeepReadonly<Ref<string>>;
  /** The provisional tail, which the provider may still revise. Rendered as such. */
  readonly partialText: DeepReadonly<Ref<string>>;
  readonly failure: DeepReadonly<Ref<RecordingFailure | null>>;
  readonly transcription: DeepReadonly<Ref<Transcription | null>>;
  readonly isRecording: ComputedRef<boolean>;
  readonly isBusy: ComputedRef<boolean>;
  readonly hasRecoverableText: ComputedRef<boolean>;
  /*
   * Properties holding functions rather than methods: they are closures with
   * no receiver, so a page may destructure them off the controller.
   */
  readonly start: (language: TranscriptionLanguage) => Promise<void>;
  readonly stop: () => Promise<void>;
  /** Persists what survived a failure, so a dropped socket costs nothing but time. */
  readonly saveRecoveredText: () => Promise<void>;
  /** Also releases the microphone and the socket, so it is safe to call on unmount. */
  readonly discard: () => Promise<void>;
  readonly dismissFailure: () => void;
}
