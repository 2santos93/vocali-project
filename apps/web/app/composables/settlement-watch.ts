import type { Transcription } from '@vocali/contracts';
import type {
  SettlementOutcome,
  SettlementWatch,
  TranscriptionUpdateStream,
} from './types/settlement';

/**
 * How long to wait on the socket before deciding the push is not coming.
 * Bounded only because a push that silently fails is worse than the polling it
 * replaced: nothing else is left to notice. Long enough that the fallback
 * below is genuinely a fallback rather than the common path.
 */
const PUSH_WATCH_BUDGET_MS = 300_000;

/**
 * A long file can outlast any interval worth choosing, so the bound matters
 * more than the numbers — a loop without one is a tab polling the API while
 * its owner is at lunch. When the budget runs out the record is not lost, so
 * the caller says "still processing" rather than reporting an error.
 */
const FALLBACK_POLL_INTERVAL_MS = 15_000;
const MAX_FALLBACK_POLL_ATTEMPTS = 8;

interface Settlement<T> {
  readonly settled: Promise<T>;
  readonly settle: (value: T) => void;
}

/**
 * A promise settled from outside itself, because the handler that resolves it
 * is registered before the waiting starts. Settling twice is a no-op, which
 * matters when a push arrives in the same turn as a close.
 */
function createSettlement<T>(): Settlement<T> {
  let settle: ((value: T) => void) | undefined;

  const settled = new Promise<T>((resolve) => {
    settle = resolve;
  });

  if (settle === undefined) {
    // Unreachable: a promise executor runs synchronously. Thrown rather than
    // asserted away, because a non-null assertion would be silent if that ever
    // stopped being true.
    throw new Error('Promise executor did not run synchronously');
  }

  return { settled, settle };
}

/**
 * False covers every way the push might not have arrived — no socket, a drop,
 * or silence past the budget — collapsed on purpose: distinguishing them would
 * report the transport to a user who only asked to transcribe a file.
 */
async function watchThroughSocket(watch: SettlementWatch): Promise<boolean> {
  const settlement = createSettlement<boolean>();

  let stream: TranscriptionUpdateStream;
  try {
    stream = await watch.gateway.openUpdateStream({
      onTranscription(record: Transcription) {
        // The socket carries every transcription this user owns, so another
        // tab's completion arrives here too.
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
      // `race` starts both, so a push that arrives first leaves this timer
      // pending and abandoned. Accepted rather than worked around: `wait` has
      // no cancellation, and the page clears the handle on unmount.
      watch.gateway.wait(PUSH_WATCH_BUDGET_MS).then(() => false),
    ]);
  } finally {
    // Closed on every exit, including the one where the push arrived: the
    // browser would otherwise hold it until API Gateway's two-hour ceiling.
    stream.close();
  }
}

/**
 * A failed request is swallowed and retried rather than surfaced: by this
 * point the file is in storage, so a read failure means the watching broke,
 * not the upload, and reporting it would claim the audio was lost.
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

/** The socket first; polling only if that did not deliver. */
export async function watchUntilSettled(watch: SettlementWatch): Promise<SettlementOutcome> {
  if (await watchThroughSocket(watch)) return 'settled';

  return pollUntilSettled(watch);
}
