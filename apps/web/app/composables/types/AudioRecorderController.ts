import type { Transcription, TranscriptionLanguage } from '@vocali/contracts';
import type { ComputedRef, DeepReadonly, Ref } from 'vue';
import type { RecordingFailure } from './RecordingFailure';
import type { RecordingPhase } from './RecordingPhase';

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
