import type { TranslatableMessage } from '../../i18n/types/TranslatableMessage';
import type { FileUploadFailureCode } from './FileUploadFailureCode';

export interface FileUploadFailure {
  readonly code: FileUploadFailureCode;
  /** Phrased so it says what to do next. */
  readonly message: TranslatableMessage;
}
