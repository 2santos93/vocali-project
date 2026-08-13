import type { Transcription } from '@vocali/contracts';
import type {
  SettlementOutcome,
  SettlementWatch,
  TranscriptionUpdateStream,
} from './types/settlement';

const PUSH_WATCH_BUDGET_MS = 300_000;

const FALLBACK_POLL_INTERVAL_MS = 15_000;
const MAX_FALLBACK_POLL_ATTEMPTS = 8;

interface Settlement<T> {
  readonly settled: Promise<T>;
  readonly settle: (value: T) => void;
}

function createSettlement<T>(): Settlement<T> {
  let settle: ((value: T) => void) | undefined;

  const settled = new Promise<T>((resolve) => {
    settle = resolve;
  });

  if (settle === undefined) {
    throw new Error('Promise executor did not run synchronously');
  }

  return { settled, settle };
}

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
      watch.gateway.wait(PUSH_WATCH_BUDGET_MS).then(() => false),
    ]);
  } finally {
    // Closed on every exit, including the one where the push arrived: the
    // browser would otherwise hold it until API Gateway's two-hour ceiling.
    stream.close();
  }
}

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
