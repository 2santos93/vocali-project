import type { Transcription } from '@vocali/contracts';
import type { SettlementWatchGateway } from './SettlementWatchGateway';

export interface SettlementWatch {
  readonly gateway: SettlementWatchGateway;
  readonly transcriptionId: string;
  /**
   * One callback for both the pushed record and the polled one: they are the
   * same record by different routes, and two would drift over "finished".
   */
  readonly apply: (record: Transcription) => boolean;
}
