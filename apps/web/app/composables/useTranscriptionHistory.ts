import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { ListTranscriptionsResponseSchema, TRANSCRIPTION_PAGE_SIZE } from '@vocali/contracts';
import type { Transcription } from '@vocali/contracts';

/**
 * The single network call this composable makes, taken as a collaborator
 * rather than reached for directly.
 *
 * The call itself is one line of `$fetch` and belongs to the page. Keeping it
 * out of here is what lets the pagination behaviour — the part with the rules
 * — be driven under Jest with no server and no network.
 *
 * It resolves to `unknown` on purpose: what comes back has crossed a trust
 * boundary, so it is parsed against the contract rather than asserted into
 * shape.
 */
export type ListTranscriptionsRequest = (cursor: string | null) => Promise<unknown>;

export interface TranscriptionHistory {
  readonly transcriptions: ComputedRef<readonly Transcription[]>;
  /** Counted here, from the cursor trail; the API has no notion of one. */
  readonly pageNumber: ComputedRef<number>;
  /** The product's page size, taken from the contract the API paginates by. */
  readonly pageSize: number;
  readonly hasPrevious: ComputedRef<boolean>;
  readonly hasNext: ComputedRef<boolean>;
  /**
   * True while a page is in flight, and also before the first one has been
   * asked for. Starting at false would let the very first paint claim the user
   * has no transcriptions, a frame before the request that would have proved
   * otherwise even begins.
   */
  readonly loading: ComputedRef<boolean>;
  /** Null while what is on screen is the truth. */
  readonly errorMessage: Readonly<Ref<string | null>>;
  /** True when the last failure was the session ending rather than a fault. */
  readonly sessionExpired: Readonly<Ref<boolean>>;
  loadFirstPage: () => Promise<void>;
  goToNextPage: () => Promise<void>;
  goToPreviousPage: () => Promise<void>;
  retryCurrentPage: () => Promise<void>;
}

export const HISTORY_LOAD_FAILURE_MESSAGE =
  'No hemos podido cargar tu historial. Comprueba tu conexión y vuelve a intentarlo.';

export const SESSION_EXPIRED_MESSAGE = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';

/**
 * Reads an HTTP status off a rejected request without asserting a type onto it.
 *
 * The BFF proxy passes the API's status through and refreshes an expired
 * access token before it would ever surface, so a 401 reaching this side means
 * the session is genuinely over — not merely stale. That is a different fact
 * from "the request failed", and telling a clinician to check their connection
 * when they simply need to sign in again sends them to the wrong remedy.
 */
export function readStatusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return null;
  }
  const { statusCode } = error;
  return typeof statusCode === 'number' ? statusCode : null;
}

export function isSessionExpired(error: unknown): boolean {
  return readStatusCode(error) === 401;
}

export function useTranscriptionHistory(
  requestPage: ListTranscriptionsRequest,
): TranscriptionHistory {
  const items = ref<Transcription[]>([]);
  const nextCursor = ref<string | null>(null);
  const inFlight = ref<boolean>(false);
  const hasSettled = ref<boolean>(false);
  const errorMessage = ref<string | null>(null);
  const sessionExpired = ref<boolean>(false);

  /*
   * The cursors already spent, oldest first, with the one that produced the
   * page on screen at the end. The first page is fetched with no cursor, so
   * the trail starts as `[null]` and its length is the page number.
   *
   * This is the whole of "Anterior": pop the trail and re-fetch with the
   * cursor that produced the page before. The API pages forwards over an
   * opaque DynamoDB key and has no backwards page to ask for, so a client that
   * does not remember where it has been cannot go back at all. Numbering the
   * pages would mean walking every page before the one wanted, which is the
   * cost this data model was chosen to avoid.
   */
  const trail = ref<(string | null)[]>([null]);

  const currentCursor = computed<string | null>(() => trail.value.at(-1) ?? null);

  async function loadPage(cursor: string | null): Promise<void> {
    inFlight.value = true;
    errorMessage.value = null;
    sessionExpired.value = false;
    try {
      const page = ListTranscriptionsResponseSchema.parse(await requestPage(cursor));

      /*
       * Ten per page is a product requirement, not a rendering detail, and
       * TRANSCRIPTION_PAGE_SIZE is the same constant the API pages by, so the
       * two cannot drift. A response carrying more than one page of records is
       * not something this screen can show without silently breaking that
       * requirement, and a longer list than the product defines is a worse
       * answer than a failure the user can retry.
       */
      if (page.items.length > TRANSCRIPTION_PAGE_SIZE) {
        throw new Error('The API returned more records than a page holds.');
      }

      items.value = page.items;
      nextCursor.value = page.nextCursor;
    } catch (error) {
      // What is on screen is no longer the truth, so it does not stay on
      // screen: a stale page under an error banner reads as current data.
      items.value = [];
      nextCursor.value = null;
      sessionExpired.value = isSessionExpired(error);
      errorMessage.value = sessionExpired.value
        ? SESSION_EXPIRED_MESSAGE
        : HISTORY_LOAD_FAILURE_MESSAGE;
    } finally {
      inFlight.value = false;
      hasSettled.value = true;
    }
  }

  async function loadFirstPage(): Promise<void> {
    if (inFlight.value) {
      return;
    }
    trail.value = [null];
    await loadPage(null);
  }

  async function goToNextPage(): Promise<void> {
    if (inFlight.value || nextCursor.value === null) {
      return;
    }
    // Recorded before the request, so a page that fails to load is still the
    // page the user is on: retrying reloads it, and Anterior leaves it.
    trail.value = [...trail.value, nextCursor.value];
    await loadPage(currentCursor.value);
  }

  async function goToPreviousPage(): Promise<void> {
    if (inFlight.value || trail.value.length <= 1) {
      return;
    }
    trail.value = trail.value.slice(0, -1);
    await loadPage(currentCursor.value);
  }

  async function retryCurrentPage(): Promise<void> {
    if (inFlight.value) {
      return;
    }
    await loadPage(currentCursor.value);
  }

  return {
    transcriptions: computed<readonly Transcription[]>(() => items.value),
    pageNumber: computed<number>(() => trail.value.length),
    pageSize: TRANSCRIPTION_PAGE_SIZE,
    hasPrevious: computed<boolean>(() => trail.value.length > 1),
    hasNext: computed<boolean>(() => nextCursor.value !== null),
    loading: computed<boolean>(() => inFlight.value || !hasSettled.value),
    errorMessage,
    sessionExpired,
    loadFirstPage,
    goToNextPage,
    goToPreviousPage,
    retryCurrentPage,
  };
}
