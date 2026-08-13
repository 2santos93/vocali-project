import { TRANSCRIPTION_UPDATE_EVENT } from '@vocali/contracts/constants';
import type { ConnectionRegistry } from '../../domain/ports/connection-registry.js';
import type { ConnectionPublisher } from '../../domain/ports/connection-publisher.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { toPublicTranscription } from './public-transcription.js';

interface PublishTranscriptionUpdateInput {
  readonly userId: string;
  readonly transcriptionId: string;
}

/**
 * Pushes a settled transcription to every socket its owner has open.
 *
 * This is the half of the design that replaces the browser's polling loop. It
 * runs on the provider callback path, immediately after the record has been
 * written, and it is the reason a client no longer has to ask.
 *
 * **Nothing here may fail the caller.** The provider is waiting for a 2xx and
 * will redeliver until it gets one, and a redelivery costs a second callback
 * for a transcription that is already complete. A browser whose owner closed
 * the laptop lid must never cause a finished transcription to be reported as
 * failed, so a connection that has gone away is cleaned up rather than raised,
 * and a publish that fails outright is logged rather than thrown. The handler
 * that calls this holds a second guard for the same reason; two are correct
 * here, because the consequence of getting it wrong is a lost transcript.
 *
 * The whole public transcription is sent, not an id. A push carrying only "one
 * of your records changed" would have every client answer it with the request
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
      // Nothing to describe. Reachable if another writer removed the record
      // between the write and this read; it is not this path's business to
      // decide what that means, and it is certainly not a reason to fail a
      // callback that has already been applied.
      return;
    }

    const open = await this.connections.listByUser(input.userId);
    if (open.length === 0) {
      // The overwhelmingly common case for a user who uploaded and closed the
      // tab. Not a failure and not worth a log line: the record is in the
      // history, and the next page load reads it.
      return;
    }

    // The public DTO, never the primitives: `toPrimitives()` carries the
    // owning `userId` and three internal object keys, and this payload leaves
    // the platform.
    const payload = {
      type: TRANSCRIPTION_UPDATE_EVENT,
      transcription: toPublicTranscription(transcription.toPrimitives()),
    };

    // Settled rather than `all`: one connection being throttled must not stop
    // the user's other tabs being told. `all` rejects on the first failure and
    // abandons the rest of the list.
    const results = await Promise.allSettled(
      open.map(async ({ connectionId }) => {
        const outcome = await this.publisher.publish({ connectionId, payload });
        if (outcome === 'gone') {
          // The client vanished without a close frame, so no `$disconnect`
          // ever arrived. Deleting it here is what stops the entry being
          // published to on every future completion until its expiry.
          await this.connections.remove(input.userId, connectionId);
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        // Logged and swallowed. The connection id is deliberately absent: it
        // identifies one browser session of one named user, and this line is
        // written on a path that already carries the correlation id.
        this.logger.warn('Could not push a transcription update to a connection', {
          transcriptionId: input.transcriptionId,
        });
      }
    }
  }
}
