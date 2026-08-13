import type { TranslatableMessage } from '../../i18n/types';

export type FileRejectionCode = 'UNSUPPORTED_FORMAT' | 'FILE_TOO_LARGE' | 'EMPTY_FILE';

/**
 * A key and its values rather than a finished sentence, so the language it is
 * read in is the one in force when it renders, not when the file was dropped.
 */
export interface FileRejection {
  readonly code: FileRejectionCode;
  readonly message: TranslatableMessage;
  readonly fileName: string;
}
