import type { TranscriptFormat } from '@vocali/contracts';

/**
 * Resolves to `unknown`: the answer has crossed a trust boundary and is
 * parsed, not asserted.
 */
export type RequestDownloadUrl = (
  transcriptionId: string,
  format: TranscriptFormat,
) => Promise<unknown>;
