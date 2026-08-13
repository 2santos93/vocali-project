import type { SaveRealtimeTranscription } from '../../application/use-cases/save-realtime-transcription.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface SaveRealtimeTranscriptionDependencies {
  readonly useCase: SaveRealtimeTranscription;
  readonly logger: Logger;
}
