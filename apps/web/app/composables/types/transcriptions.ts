import type { TranscriptFormat, Transcription } from '@vocali/contracts';
import type { ComputedRef, Ref } from 'vue';
import type { TranslatableMessage } from '../../i18n/types';

export type QueryRequester = (path: string, query: Record<string, string>) => Promise<unknown>;

export type ListTranscriptionsRequest = (cursor: string | null) => Promise<unknown>;

/**
 * Resolves to `unknown`: the answer has crossed a trust boundary and is
 * parsed, not asserted.
 */
export type RequestDownloadUrl = (
  transcriptionId: string,
  format: TranscriptFormat,
) => Promise<unknown>;

/** Hands the signed URL to the browser. Substituted in tests. */
export type FollowDownloadUrl = (url: string, fileName: string) => void;

export interface TranscriptionHistory {
  readonly transcriptions: ComputedRef<readonly Transcription[]>;
  /** Counted here, from the cursor trail; the API has no notion of one. */
  readonly pageNumber: ComputedRef<number>;
  /** The product's page size, taken from the contract the API paginates by. */
  readonly pageSize: number;
  readonly hasPrevious: ComputedRef<boolean>;
  readonly hasNext: ComputedRef<boolean>;
  readonly loading: ComputedRef<boolean>;
  /** Null while what is on screen is the truth. */
  readonly errorMessage: Readonly<Ref<TranslatableMessage | null>>;
  /** True when the last failure was the session ending rather than a fault. */
  readonly sessionExpired: Readonly<Ref<boolean>>;
  loadFirstPage: () => Promise<void>;
  goToNextPage: () => Promise<void>;
  goToPreviousPage: () => Promise<void>;
  retryCurrentPage: () => Promise<void>;
}

export interface TranscriptionDownload {
  /** The transcription whose URL is being fetched, so its row can show it. */
  readonly downloadingId: Readonly<Ref<string | null>>;
  readonly errorMessage: Readonly<Ref<TranslatableMessage | null>>;
  download: (transcription: Transcription, format?: TranscriptFormat) => Promise<void>;
  dismissError: () => void;
}
