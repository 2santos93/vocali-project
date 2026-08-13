import type { Transcription } from '@vocali/contracts';

/**
 * Narrowed so a test can supply a double without implementing a protocol.
 * There is no `send`, and the API has no route that would receive one.
 */
export interface SocketLike {
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

export interface TranscriptionUpdateStream {
  close(): void;
}

export interface UpdateStreamHandlers {
  /** One settled transcription, already validated against the shared contract. */
  onTranscription: (transcription: Transcription) => void;
  /**
   * The socket ended, for any reason. The caller's business is that pushes
   * have stopped arriving, not which of the reasons it was.
   */
  onClosed: () => void;
}

export type UpdateStreamOpener = (
  handlers: UpdateStreamHandlers,
) => Promise<TranscriptionUpdateStream>;

/** What the watch needs of its caller's gateway, and nothing more. */
export interface SettlementWatchGateway {
  /** The normal path; polling is what happens when this rejects. */
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
   * One callback for both the pushed record and the polled one: they are the
   * same record by different routes, and two would drift over "finished".
   */
  readonly apply: (record: Transcription) => boolean;
}

/**
 * `settled` means the outcome is known — transcribed or failed. `waiting`
 * means the budget ran out with the record still being worked on, which is not
 * an error and must not be reported as one.
 */
export type SettlementOutcome = 'settled' | 'waiting';
