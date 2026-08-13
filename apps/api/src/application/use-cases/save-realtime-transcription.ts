import type { Transcription as TranscriptionDto } from '@vocali/contracts';
import { Transcription } from '../../domain/entities/transcription.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { IdGenerator } from '../../domain/ports/id-generator.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import type { SaveRealtimeTranscriptionInput } from '../types/save-realtime-transcription-input.js';
import { buildTranscriptObjectKey } from './object-keys.js';
import { toPublicTranscription } from './public-transcription.js';

/**
 * The transcript is produced client-side and handed over complete, so no domain
 * rule is left to reject it: failures here are infrastructure trouble and
 * propagate as exceptions rather than a `Result`.
 *
 * It is also the only write path the user's own browser retries. With a
 * `clientSessionId` a retry returns what the first call stored, indistinguishably
 * from that first call: same id, same body, one record.
 */
export class SaveRealtimeTranscription {
  constructor(
    private readonly repository: TranscriptionRepository,
    private readonly storage: FileStorage,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: SaveRealtimeTranscriptionInput): Promise<TranscriptionDto> {
    if (input.clientSessionId !== undefined) {
      // Not the safety net — the conditional write below is. This exists so the
      // ordinary retry costs one read instead of two S3 objects under a fresh
      // id that the write then refuses, leaving them orphaned.
      const claimed = await this.repository.findByClientSession(
        input.userId,
        input.clientSessionId,
      );
      if (claimed !== null) return toPublicTranscription(claimed.toPrimitives());
    }

    const id = this.idGenerator.next();
    const transcriptObjectKey = buildTranscriptObjectKey(input.userId, id, 'txt');
    const jsonObjectKey = buildTranscriptObjectKey(input.userId, id, 'json');

    // Both formats, as `CompleteTranscription` does. The download use case
    // derives the object key from the requested format alone, so a record that
    // stored only `.txt` would still sign a URL for a `.json` that never
    // existed.
    await this.storage.putText({
      objectKey: transcriptObjectKey,
      body: input.text,
      contentType: 'text/plain',
    });
    await this.storage.putText({
      objectKey: jsonObjectKey,
      body: JSON.stringify({ text: input.text, durationSeconds: input.durationSeconds }),
      contentType: 'application/json',
    });

    const transcription = Transcription.createFromRealtimeSession({
      id,
      userId: input.userId,
      language: input.language,
      durationSeconds: input.durationSeconds,
      transcriptObjectKey,
      text: input.text,
      createdAt: this.clock.now(),
    });

    const written = await this.repository.save(transcription, {
      clientSessionId: input.clientSessionId,
    });
    if (!written.success) {
      if (input.clientSessionId !== undefined) {
        // Two retries in flight at once: the other claimed the session id
        // between the read above and this write. A conflict response would
        // push the client into retrying against a record that already exists.
        const claimed = await this.repository.findByClientSession(
          input.userId,
          input.clientSessionId,
        );
        if (claimed !== null) return toPublicTranscription(claimed.toPrimitives());
      }

      // Unreachable without a session id: the record was built around an id
      // generated moments ago, so nothing else holds it and there is no earlier
      // revision to lose to. An invariant violation rather than an outcome a
      // caller must handle, so it throws.
      throw new Error(
        `Invariant violated: SaveRealtimeTranscription could not persist a newly created transcription (${written.error.message})`,
      );
    }

    // The public DTO, not the entity: `toPrimitives()` carries `userId` and
    // three internal object keys, and the obvious handler returns whatever this
    // resolves to.
    return toPublicTranscription(transcription.toPrimitives());
  }
}
