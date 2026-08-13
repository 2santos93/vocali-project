import { computed, ref } from 'vue';
import { ListTranscriptionsResponseSchema, TRANSCRIPTION_PAGE_SIZE } from '@vocali/contracts';
import type { Transcription, TranscriptFormat } from '@vocali/contracts';
import type { TranslatableMessage } from '../i18n/types';
import { TRANSCRIPTIONS_PATH, transcriptionDownloadPath } from '../utils/api-routes';
import { isSessionExpired, SESSION_EXPIRED_MESSAGE } from '../utils/http-failure';
import type {
  ListTranscriptionsRequest,
  QueryRequester,
  TranscriptionHistory,
} from './types/transcriptions';

export function createHistoryRequests(request: QueryRequester): {
  listTranscriptions: ListTranscriptionsRequest;
  requestDownloadUrl: (transcriptionId: string, format: TranscriptFormat) => Promise<unknown>;
} {
  return {
    listTranscriptions(cursor: string | null): Promise<unknown> {
      // Omitted rather than sent empty: the API validates the cursor it is
      // given, and `?cursor=` is a malformed cursor rather than no cursor.
      return request(TRANSCRIPTIONS_PATH, cursor === null ? {} : { cursor });
    },

    requestDownloadUrl(transcriptionId: string, format: TranscriptFormat): Promise<unknown> {
      return request(transcriptionDownloadPath(transcriptionId), { format });
    },
  };
}

export const HISTORY_LOAD_FAILURE_MESSAGE: TranslatableMessage = { key: 'failure.historyLoad' };

export function useTranscriptionHistory(
  requestPage: ListTranscriptionsRequest,
): TranscriptionHistory {
  const items = ref<Transcription[]>([]);
  const nextCursor = ref<string | null>(null);
  const inFlight = ref<boolean>(false);
  const hasSettled = ref<boolean>(false);
  const errorMessage = ref<TranslatableMessage | null>(null);
  const sessionExpired = ref<boolean>(false);

  const trail = ref<(string | null)[]>([null]);

  const currentCursor = computed<string | null>(() => trail.value.at(-1) ?? null);

  async function loadPage(cursor: string | null): Promise<void> {
    inFlight.value = true;
    errorMessage.value = null;
    sessionExpired.value = false;
    try {
      const page = ListTranscriptionsResponseSchema.parse(await requestPage(cursor));

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
