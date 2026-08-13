import type { PublishOutcome } from '../types/publish-outcome.js';

export interface ConnectionPublisher {
  publish(input: { connectionId: string; payload: unknown }): Promise<PublishOutcome>;
}
