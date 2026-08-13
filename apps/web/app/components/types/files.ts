import type { TranslatableMessage } from '../../i18n/types';

export type FileRejectionCode = 'UNSUPPORTED_FORMAT' | 'FILE_TOO_LARGE' | 'EMPTY_FILE';

export interface FileRejection {
  readonly code: FileRejectionCode;
  readonly message: TranslatableMessage;
  readonly fileName: string;
}
