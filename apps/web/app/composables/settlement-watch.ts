import type { Transcription } from '@vocali/contracts';
import type { TranscriptionUpdateStream, UpdateStreamOpener } from './useTranscriptionUpdates';

/**
 * Finding out that a transcription has finished.
 *
 * A separate concern from uploading one. The upload ends when the bytes reach
 * the bucket; everything here happens afterwards, and answers a question the
 * uploader does not ask — the server pushes the outcome down a socket, and
 * this is what notices when it does not.
 *
 * Nothing here touches a phase or a failure. It is handed an `apply` callback
 * and reports one of two outcomes, which is what keeps the reasoning about
 * budgets and dangling timers separable from the reasoning about what the user
 * sees.
 */

/**
 * How long to wait on the socket before deciding the push is not coming.
 *
 * Five minutes, and waiting costs nothing: while the socket is open this makes
 * no requests at all, so the only reason to bound it is the failure this whole
 * design has to answer for — **a push that silently fails is worse than the
 * polling it replaced, because nothing is left to notice it.** If the server
 * never publishes, or publishes to a connection that quietly stopped
 * delivering, this is what notices.
 *
 * Long enough that an ordinary transcription of a twenty-megabyte file settles
 * well inside it, so the fallback below is genuinely a fallback rather than
 * the common path.
 */
const PUSH_WATCH_BUDGET_MS = 300_000;

/**
 * The fallback, and deliberately unlike the loop it replaced.
 *
 * That loop asked for the whole first page of the history every three seconds,
 * twenty times — sixty pages fetched to watch one field, and a record overtaken
 * by ten newer uploads dropped off the page it was searching. This asks for the
 * one record, and asks eight times at fifteen seconds: eight requests against
 * sixty, over two minutes rather than one.
 *
 * The bound still matters more than the numbers. A long file can outlast any
 * interval worth choosing, so a loop without a limit is a tab polling the API
 * while its owner is at lunch. When the budget runs out the record is not lost
 * — it is in the history, still being transcribed — so the honest end state
 * says exactly that rather than an error.
 */
const FALLBACK_POLL_INTERVAL_MS = 15_000;
const MAX_FALLBACK_POLL_ATTEMPTS = 8;

/** What the watch needs of its caller's gateway, and nothing more. */
export interface SettlementWatchGateway {
  /**
   * Opens the socket the API pushes settled transcriptions down, and rejects
   * if it cannot be opened. This is the normal path; everything below it is
   * what happens when it does not work.
   */
  openUpdateStream: UpdateStreamOpener;
  /** One record by id — the fallback's request, and only the fallback's. */
  getTranscription(transcriptionId: string): Promise<Transcription>;
  /** Injected so the schedule is something a test advances, not waits out. */
  wait(milliseconds: number): Promise<void>;
}

export interface SettlementWatch {
  readonly gateway: SettlementWatchGateway;
  readonly transcriptionId: string;
  /**
   * Records the arrived transcription and answers whether it has settled.
   *
   * One callback for both the pushed record and the polled one, because they
   * are the same record arriving by different routes and the two must not
   * drift into disagreeing about what "finished" means.
   */
  readonly apply: (record: Transcription) => boolean;
}

/**
 * `settled` means the outcome is known — transcribed or failed. `waiting`
 * means the budget ran out with the record still being worked on, which is not
 * an error and must not be reported as one.
 */
export type SettlementOutcome = 'settled' | 'waiting';

interface Settlement<T> {
  readonly settled: Promise<T>;
  readonly settle: (value: T) => void;
}

/**
 * A promise settled from outside itself.
 *
 * The socket watch needs one because the thing that resolves it is an event
 * handler registered before the waiting starts, and there is no way to express
 * that with `new Promise` alone without nesting the whole watch inside an
 * executor.
 *
 * Settling twice is a no-op, which matters here: a push arriving in the same
 * turn as a close would otherwise be a race about which value won.
 */
function createSettlement<T>(): Settlement<T> {
  let settle: ((value: T) => void) | undefined;

  const settled = new Promise<T>((resolve) => {
    settle = resolve;
  });

  if (settle === undefined) {
    // Unreachable: a promise executor runs synchronously, so the assignment
    // above has already happened. Stated rather than asserted away, because
    // the alternative is a non-null assertion that would also be silent if
    // that ever stopped being true.
    throw new Error('Promise executor did not run synchronously');
  }

  return { settled, settle };
}

/**
 * Waits for the server to push the outcome.
 *
 * Returns true when it did, and false for every way it might not have: the
 * socket could not be opened, it dropped, or it stayed open and silent for
 * longer than the budget. The caller does the same thing in all three cases,
 * and collapsing them here is deliberate — a client that distinguished them
 * would be reporting the transport to a user who only asked to transcribe a
 * file.
 */
async function watchThroughSocket(watch: SettlementWatch): Promise<boolean> {
  const settlement = createSettlement<boolean>();

  let stream: TranscriptionUpdateStream;
  try {
    stream = await watch.gateway.openUpdateStream({
      onTranscription(record: Transcription) {
        // The socket carries every transcription this user owns, so a
        // completion belonging to another tab's upload arrives here too.
        // Acting on it would report someone else's file as this one.
        if (record.id !== watch.transcriptionId) return;
        if (watch.apply(record)) {
          settlement.settle(true);
        }
      },
      onClosed() {
        settlement.settle(false);
      },
    });
  } catch {
    // No stream, so nothing to close. The caller polls.
    return false;
  }

  try {
    return await Promise.race([
      settlement.settled,
      // The one place the silent-failure case is caught. `wait` is injected,
      // so this is something a test advances rather than five minutes it has
      // to sit through.
      //
      // `race` starts both, so a push that arrives first leaves this timer
      // pending and abandoned — it fires five minutes later and resolves a
      // promise nobody is awaiting. Stated rather than worked around: `wait`
      // has no cancellation to offer, adding one would put an abort
      // mechanism in the gateway for this single caller, and one dangling
      // timer per upload is not the same order of cost as the sixty history
      // requests this replaced. The page holds the outstanding handle and
      // clears it when the component unmounts.
      watch.gateway.wait(PUSH_WATCH_BUDGET_MS).then(() => false),
    ]);
  } finally {
    // Closed on every exit, including the one where the push arrived: a
    // socket left open belongs to an upload that is over, and the browser
    // would hold it until API Gateway's two-hour ceiling.
    stream.close();
  }
}

/**
 * Asks for the one record, on a slow schedule, until it settles or the
 * budget runs out.
 *
 * A failed request is swallowed and retried rather than surfaced. By this
 * point the file is in storage and the record exists; a transient read
 * failure means the watching broke, not the upload, and reporting it as an
 * upload error would tell the user their audio was lost when it was not. A
 * 404 is the same: the record is written before the upload is acknowledged,
 * so this is a read that lost a race, not a record that is missing.
 */
async function pollUntilSettled(watch: SettlementWatch): Promise<SettlementOutcome> {
  for (let attempt = 0; attempt < MAX_FALLBACK_POLL_ATTEMPTS; attempt += 1) {
    await watch.gateway.wait(FALLBACK_POLL_INTERVAL_MS);

    let record: Transcription;
    try {
      record = await watch.gateway.getTranscription(watch.transcriptionId);
    } catch {
      continue;
    }

    if (watch.apply(record)) return 'settled';
  }

  return 'waiting';
}

/**
 * Watches the record until it settles: the socket first, polling only if that
 * did not deliver.
 *
 * The order is the whole change. The old flow asked the API for the user's
 * entire history every three seconds until the record moved, which is sixty
 * requests to observe one field and was visible to anyone who opened the
 * network tab.
 */
export async function watchUntilSettled(watch: SettlementWatch): Promise<SettlementOutcome> {
  if (await watchThroughSocket(watch)) return 'settled';

  return pollUntilSettled(watch);
}
