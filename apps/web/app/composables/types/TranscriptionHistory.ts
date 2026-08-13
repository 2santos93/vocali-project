import type { Transcription } from '@vocali/contracts';
import type { ComputedRef, Ref } from 'vue';
import type { TranslatableMessage } from '../../i18n/types/TranslatableMessage';

export interface TranscriptionHistory {
  readonly transcriptions: ComputedRef<readonly Transcription[]>;
  /** Counted here, from the cursor trail; the API has no notion of one. */
  readonly pageNumber: ComputedRef<number>;
  /** The product's page size, taken from the contract the API paginates by. */
  readonly pageSize: number;
  readonly hasPrevious: ComputedRef<boolean>;
  readonly hasNext: ComputedRef<boolean>;
  /**
   * True while a page is in flight, and also before the first is asked for:
   * starting at false lets the first paint claim the user has no
   * transcriptions, a frame before the request that disproves it begins.
   */
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
