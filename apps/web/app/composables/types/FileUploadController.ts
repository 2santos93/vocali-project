import type { Transcription } from '@vocali/contracts';
import type { ComputedRef, DeepReadonly, Ref } from 'vue';
import type { FileUploadFailure } from './FileUploadFailure';
import type { FileUploadPhase } from './FileUploadPhase';

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
