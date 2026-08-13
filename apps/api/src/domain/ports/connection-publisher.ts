import type { PublishOutcome } from '../types/connection.js';

export interface ConnectionPublisher {
  publish(input: { connectionId: string; payload: unknown }): Promise<PublishOutcome>;
}
