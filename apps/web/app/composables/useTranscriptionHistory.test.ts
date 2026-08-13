import { TRANSCRIPTION_PAGE_SIZE } from '@vocali/contracts';
import type { Transcription } from '@vocali/contracts';
import { SESSION_EXPIRED_MESSAGE } from '../utils/http-failure';
import {
  createHistoryRequests,
  HISTORY_LOAD_FAILURE_MESSAGE,
  useTranscriptionHistory,
} from './useTranscriptionHistory';

function makeTranscription(overrides: Partial<Transcription> = {}): Transcription {
  return {
    id: 'transcription-1',
    fileName: 'consulta.mp3',
    source: 'FILE',
    status: 'COMPLETED',
    language: 'es',
    durationSeconds: 95,
    sizeBytes: 2 * 1024 * 1024,
    textPreview: 'El paciente refiere dolor lumbar.',
    errorMessage: null,
    createdAt: '2026-08-11T09:30:00.000Z',
    updatedAt: '2026-08-11T09:31:00.000Z',
    ...overrides,
  };
}

function makePageOf(count: number): Transcription[] {
  return Array.from({ length: count }, (_unused, index) =>
    makeTranscription({ id: `transcription-${String(index + 1)}` }),
  );
}

interface Deferred {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
}

function createDeferred(): Deferred {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** What the BFF proxy hands back when the session is genuinely over. */
function unauthorized(): Error & { statusCode: number } {
  return Object.assign(new Error('Unauthorized'), { statusCode: 401 });
}

describe('useTranscriptionHistory', () => {
  /*
   * The screen renders before its `onMounted` load has begun. Reporting "not
   * loading" for that frame lets the table show "todavía no tienes
   * transcripciones" to a user with a hundred of them, and then replace it —
   * telling someone their work is missing, even for a frame, is not something
   * to hand a clinician.
   */
  it('reports itself as loading before the first page has been asked for', () => {
    const history = useTranscriptionHistory(jest.fn());

    expect(history.loading.value).toBe(true);
    expect(history.transcriptions.value).toHaveLength(0);
    expect(history.errorMessage.value).toBeNull();
  });

  it('asks for the first page with no cursor, and shows what came back', async () => {
    const items = [makeTranscription()];
    const requestPage = jest.fn().mockResolvedValue({ items, nextCursor: 'cursor-2' });
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();

    expect(requestPage).toHaveBeenCalledWith(null);
    expect(history.transcriptions.value).toEqual(items);
    expect(history.pageNumber.value).toBe(1);
    expect(history.hasPrevious.value).toBe(false);
    expect(history.hasNext.value).toBe(true);
    expect(history.errorMessage.value).toBeNull();
  });

  /*
   * Ten per page is a stated product requirement, and the number is not
   * written here twice: TRANSCRIPTION_PAGE_SIZE is the same constant the API
   * pages by, so the screen and the server cannot disagree about it.
   */
  it('paginates at exactly ten per page', async () => {
    expect(TRANSCRIPTION_PAGE_SIZE).toBe(10);

    const requestPage = jest
      .fn()
      .mockResolvedValue({ items: makePageOf(TRANSCRIPTION_PAGE_SIZE), nextCursor: 'cursor-2' });
    const history = useTranscriptionHistory(requestPage);

    expect(history.pageSize).toBe(10);

    await history.loadFirstPage();

    expect(history.transcriptions.value).toHaveLength(10);
  });

  it('refuses a page carrying more records than one page holds', async () => {
    const requestPage = jest
      .fn()
      .mockResolvedValue({ items: makePageOf(TRANSCRIPTION_PAGE_SIZE + 1), nextCursor: null });
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();

    expect(history.transcriptions.value).toHaveLength(0);
    expect(history.errorMessage.value).toBe(HISTORY_LOAD_FAILURE_MESSAGE);
  });

  it('walks forward with the cursor the API handed back', async () => {
    const requestPage = jest
      .fn()
      .mockResolvedValueOnce({ items: makePageOf(10), nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: makePageOf(10), nextCursor: null });
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();
    await history.goToNextPage();

    expect(requestPage).toHaveBeenLastCalledWith('cursor-2');
    expect(history.pageNumber.value).toBe(2);
    expect(history.hasPrevious.value).toBe(true);
    expect(history.hasNext.value).toBe(false);
  });

  it('offers no next page once the API stops handing back a cursor', async () => {
    const requestPage = jest.fn().mockResolvedValue({ items: makePageOf(3), nextCursor: null });
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();
    await history.goToNextPage();

    expect(history.hasNext.value).toBe(false);
    expect(requestPage).toHaveBeenCalledTimes(1);
    expect(history.pageNumber.value).toBe(1);
  });

  /*
   * The heart of it. There is no backwards page to ask the API for, so going
   * back means replaying a cursor already spent — which only works if every
   * cursor visited is still held. Assert the exact sequence of cursors: a
   * version that re-requested the current page, or that asked the server to
   * page backwards, produces a different one.
   */
  it('goes back by replaying the cursor it already used, never asking for a backwards page', async () => {
    const requestPage = jest
      .fn()
      .mockResolvedValueOnce({ items: makePageOf(10), nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: makePageOf(10), nextCursor: 'cursor-3' })
      .mockResolvedValueOnce({ items: makePageOf(4), nextCursor: null })
      .mockResolvedValueOnce({ items: makePageOf(10), nextCursor: 'cursor-3' })
      .mockResolvedValueOnce({ items: makePageOf(10), nextCursor: 'cursor-2' });
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();
    await history.goToNextPage();
    await history.goToNextPage();
    expect(history.pageNumber.value).toBe(3);

    await history.goToPreviousPage();
    expect(history.pageNumber.value).toBe(2);
    expect(history.hasPrevious.value).toBe(true);

    await history.goToPreviousPage();
    expect(history.pageNumber.value).toBe(1);
    expect(history.hasPrevious.value).toBe(false);

    expect(requestPage.mock.calls).toEqual([
      [null],
      ['cursor-2'],
      ['cursor-3'],
      ['cursor-2'],
      [null],
    ]);
  });

  it('does nothing when asked to go back from the first page', async () => {
    const requestPage = jest.fn().mockResolvedValue({ items: makePageOf(2), nextCursor: null });
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();
    await history.goToPreviousPage();

    expect(requestPage).toHaveBeenCalledTimes(1);
    expect(history.pageNumber.value).toBe(1);
  });

  it('starts the trail again when the first page is reloaded', async () => {
    const requestPage = jest
      .fn()
      .mockResolvedValueOnce({ items: makePageOf(10), nextCursor: 'cursor-2' })
      .mockResolvedValue({ items: makePageOf(10), nextCursor: 'cursor-2' });
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();
    await history.goToNextPage();
    await history.loadFirstPage();

    expect(requestPage).toHaveBeenLastCalledWith(null);
    expect(history.pageNumber.value).toBe(1);
    expect(history.hasPrevious.value).toBe(false);
  });

  // A second press while a page is in flight would advance the trail twice and
  // skip a page of the user's own history.
  it('ignores a second navigation while a page is in flight', async () => {
    const pending = createDeferred();
    const requestPage = jest
      .fn()
      .mockResolvedValueOnce({ items: makePageOf(10), nextCursor: 'cursor-2' })
      .mockReturnValueOnce(pending.promise);
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();

    const inFlight = history.goToNextPage();
    await history.goToNextPage();

    expect(requestPage).toHaveBeenCalledTimes(2);
    expect(history.loading.value).toBe(true);

    pending.resolve({ items: makePageOf(10), nextCursor: 'cursor-3' });
    await inFlight;

    expect(history.pageNumber.value).toBe(2);
    expect(history.loading.value).toBe(false);
  });

  it('reports a failed page instead of leaving a stale one on screen', async () => {
    const requestPage = jest
      .fn()
      .mockResolvedValueOnce({ items: makePageOf(10), nextCursor: 'cursor-2' })
      .mockRejectedValueOnce(new Error('network down'));
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();
    await history.goToNextPage();

    expect(history.errorMessage.value).toBe(HISTORY_LOAD_FAILURE_MESSAGE);
    expect(history.sessionExpired.value).toBe(false);
    expect(history.transcriptions.value).toHaveLength(0);
    expect(history.hasNext.value).toBe(false);
  });

  it('stays on the page that failed, so retrying reloads that page', async () => {
    const requestPage = jest
      .fn()
      .mockResolvedValueOnce({ items: makePageOf(10), nextCursor: 'cursor-2' })
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ items: makePageOf(10), nextCursor: null });
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();
    await history.goToNextPage();
    await history.retryCurrentPage();

    expect(requestPage).toHaveBeenLastCalledWith('cursor-2');
    expect(history.pageNumber.value).toBe(2);
    expect(history.errorMessage.value).toBeNull();
    expect(history.transcriptions.value).toHaveLength(10);
  });

  /*
   * An ended session is neither an empty history nor a fault. The proxy
   * refreshes an expired access token before a 401 could reach here, so one
   * that does means signing in again — not retrying.
   */
  it('tells an ended session apart from a request that failed', async () => {
    const requestPage = jest.fn().mockRejectedValue(unauthorized());
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();

    expect(history.sessionExpired.value).toBe(true);
    expect(history.errorMessage.value).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it('treats a response that does not match the contract as a failure', async () => {
    const requestPage = jest.fn().mockResolvedValue({ items: [{ id: 'no-file-name' }] });
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();

    expect(history.errorMessage.value).toBe(HISTORY_LOAD_FAILURE_MESSAGE);
    expect(history.transcriptions.value).toHaveLength(0);
  });

  it('reports an empty history as empty rather than as a failure', async () => {
    const requestPage = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const history = useTranscriptionHistory(requestPage);

    await history.loadFirstPage();

    expect(history.transcriptions.value).toHaveLength(0);
    expect(history.errorMessage.value).toBeNull();
    expect(history.hasNext.value).toBe(false);
  });

  it('refuses to reload while a page is already in flight', async () => {
    const pending = createDeferred();
    const requestPage = jest.fn().mockReturnValueOnce(pending.promise);
    const history = useTranscriptionHistory(requestPage);

    const inFlight = history.loadFirstPage();
    await history.loadFirstPage();
    await history.retryCurrentPage();

    expect(requestPage).toHaveBeenCalledTimes(1);

    pending.resolve({ items: [], nextCursor: null });
    await inFlight;
  });
});

/**
 * The two paths the history screen calls, which were previously written inside
 * the page and therefore asserted nowhere: a page is the one layer Jest never
 * mounts, so a path living only in a page is a path nothing checks until it
 * 404s on a deployed environment.
 *
 * The paths are written out as literals rather than imported from
 * `utils/api-routes`. Importing the constant under test would assert that it
 * equals itself and would stay green through a path being changed to one the
 * API does not serve; written out, changing a path takes two deliberate edits.
 */
describe('createHistoryRequests', () => {
  it('reads a page from GET /api/transcriptions', async () => {
    const request = jest.fn().mockResolvedValue({ items: [], nextCursor: null });

    await createHistoryRequests(request).listTranscriptions(null);

    expect(request).toHaveBeenCalledWith('/api/transcriptions', {});
  });

  it('sends the cursor as a query parameter when there is one', async () => {
    const request = jest.fn().mockResolvedValue({ items: [], nextCursor: null });

    await createHistoryRequests(request).listTranscriptions('opaque-cursor');

    // Sent verbatim: the cursor is an opaque DynamoDB key and does not survive
    // being parsed and rebuilt.
    expect(request).toHaveBeenCalledWith('/api/transcriptions', { cursor: 'opaque-cursor' });
  });

  it("asks for a download URL at the transcription's own download path", async () => {
    const request = jest.fn().mockResolvedValue({ url: 'https://storage.test/x', format: 'txt' });

    await createHistoryRequests(request).requestDownloadUrl('01ABC', 'txt');

    expect(request).toHaveBeenCalledWith('/api/transcriptions/01ABC/download', { format: 'txt' });
  });

  it('carries the requested format through', async () => {
    const request = jest.fn().mockResolvedValue({ url: 'https://storage.test/x', format: 'json' });

    await createHistoryRequests(request).requestDownloadUrl('01ABC', 'json');

    expect(request).toHaveBeenCalledWith('/api/transcriptions/01ABC/download', { format: 'json' });
  });
});
