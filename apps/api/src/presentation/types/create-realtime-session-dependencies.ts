import type { CreateRealtimeSession } from '../../application/use-cases/create-realtime-session.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface CreateRealtimeSessionDependencies {
  readonly useCase: CreateRealtimeSession;
  readonly logger: Logger;
}
