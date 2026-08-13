import type { DomainErrorCode } from '@vocali/contracts/constants';

export interface RecognisedDomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
}
