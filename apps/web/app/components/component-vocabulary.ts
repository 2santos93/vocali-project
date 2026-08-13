/**
 * The vocabulary of the design system: the prop and event shapes a parent has
 * to name in order to talk to these components.
 *
 * Nothing here describes an API request or response. Those types come from
 * `@vocali/contracts` and are never redeclared on this side — a status, a
 * language or a transcription has exactly one definition in this repository.
 */

import type { TranslatableMessage } from '../i18n/translate';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type ControlSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

/**
 * Why a dropped file was refused.
 *
 * The code exists so a parent can react without matching on prose; the message
 * exists so it never has to write the prose itself. It travels as a key and
 * its values rather than as a finished sentence, so the language it is read in
 * is the one in force when it is rendered rather than the one in force when
 * the file was dropped.
 */
export type FileRejectionCode = 'UNSUPPORTED_FORMAT' | 'FILE_TOO_LARGE' | 'EMPTY_FILE';

export interface FileRejection {
  readonly code: FileRejectionCode;
  readonly message: TranslatableMessage;
  readonly fileName: string;
}
