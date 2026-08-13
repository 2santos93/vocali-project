import type { Transcription } from '@vocali/contracts';
import type { UpdateStreamOpener } from './UpdateStreamOpener';

/** What the watch needs of its caller's gateway, and nothing more. */
export interface SettlementWatchGateway {
  /** The normal path; polling is what happens when this rejects. */
  openUpdateStream: UpdateStreamOpener;
  /** One record by id — the fallback's request, and only the fallback's. */
  getTranscription(transcriptionId: string): Promise<Transcription>;
  /** Injected so the schedule is something a test advances, not waits out. */
  wait(milliseconds: number): Promise<void>;
}
