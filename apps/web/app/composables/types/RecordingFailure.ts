import type { TranslatableMessage } from '../../i18n/types/TranslatableMessage';
import type { RecordingFailureCode } from './RecordingFailureCode';

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
