import { TRANSCRIPTION_UPDATE_EVENT } from '@vocali/contracts/constants';
import type { ConnectionRegistry } from '../../domain/ports/connection-registry.js';
import type { ConnectionPublisher } from '../../domain/ports/connection-publisher.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import type { PublishTranscriptionUpdateInput } from '../types/publish-transcription-update-input.js';
import { toPublicTranscription } from './public-transcription.js';

/**
 * **Nothing here may fail the caller.** This runs on the provider callback
 * path, and the provider redelivers until it gets a 2xx. A browser whose owner
 * closed the laptop lid must never cause a finished transcription to be
 * reported as failed, so a gone connection is cleaned up and a failed publish
 * is logged, never thrown. The calling handler holds a second guard for the
 * same reason; two are correct, because the cost of being wrong is a lost
 * transcript.
 *
 * The whole public transcription is sent, not an id: a push saying only "one
 * of your records changed" would have every client answer with the request
 * this exists to remove.
 */
export class PublishTranscriptionUpdate {
  constructor(
    private readonly repository: TranscriptionRepository,
    private readonly connections: ConnectionRegistry,
    private readonly publisher: ConnectionPublisher,
    private readonly logger: Logger,
  ) {}

  async execute(input: PublishTranscriptionUpdateInput): Promise<void> {
    const transcription = await this.repository.findById(input.userId, input.transcriptionId);
    if (transcription === null) {
      // Another writer removed the record between the write and this read.
      // Not a reason to fail a callback that has already been applied.
      return;
    }

    const open = await this.connections.listByUser(input.userId);
    if (open.length === 0) {
      // The common case: uploaded, then closed the tab. Not worth a log line —
      // the record is in the history and the next page load reads it.
      return;
    }

    // The public DTO, never the primitives: `toPrimitives()` carries the owning
    // `userId` and three internal object keys, and this payload leaves the
    // platform.
    const payload = {
      type: TRANSCRIPTION_UPDATE_EVENT,
      transcription: toPublicTranscription(transcription.toPrimitives()),
    };

    // Settled rather than `all`: `all` rejects on the first failure and
    // abandons the rest, so one throttled connection would silence the user's
    // other tabs.
    const results = await Promise.allSettled(
      open.map(async ({ connectionId }) => {
        const outcome = await this.publisher.publish({ connectionId, payload });
        if (outcome === 'gone') {
          // No `$disconnect` ever arrived. Deleting it here is what stops the
          // entry being published to on every completion until it expires.
          await this.connections.remove(input.userId, connectionId);
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        // The connection id is deliberately absent: it identifies one browser
        // session of one named user, and this path already carries the
        // correlation id.
        this.logger.warn('Could not push a transcription update to a connection', {
          transcriptionId: input.transcriptionId,
        });
      }
    }
  }
}
