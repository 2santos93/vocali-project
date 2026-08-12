import type { TranscriptionLanguage } from '@vocali/contracts/constants';
import type { Transcription as TranscriptionDto } from '@vocali/contracts';
import { Transcription } from '../../domain/entities/transcription.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { IdGenerator } from '../../domain/ports/id-generator.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { buildTranscriptObjectKey } from './object-keys.js';
import { toPublicTranscription } from './public-transcription.js';

interface SaveRealtimeTranscriptionInput {
  readonly userId: string;
  readonly text: string;
  readonly durationSeconds: number;
  readonly language: TranscriptionLanguage;
  /** Present when the client minted one; see the request schema for why. */
  readonly clientSessionId?: string | undefined;
}

/**
 * Persists a finished microphone session as an already-`COMPLETED` record.
 * Unlike the file pipeline, there is no upload or provider job in between:
 * the transcript is produced client-side during the realtime session and
 * handed over complete, so there is no domain rule left to reject it — a
 * storage or repository failure here is infrastructure trouble, and
 * propagates as an exception rather than a `Result`.
 *
 * It is also the only write path the user's own browser retries. With a
 * `clientSessionId` a retry returns the transcription the first call stored,
 * indistinguishably from that first call: same id, same body, one record.
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
      // Asked before anything is written, not as the safety net — the write
      // below is that. It exists so the ordinary retry, the one arriving after
      // the first call committed, costs one read instead of two S3 objects
      // under a fresh id that the transaction then refuses, leaving them
      // orphaned with nothing pointing at them.
      const claimed = await this.repository.findByClientSession(
        input.userId,
        input.clientSessionId,
      );
      if (claimed !== null) return toPublicTranscription(claimed.toPrimitives());
    }

    const id = this.idGenerator.next();
    const transcriptObjectKey = buildTranscriptObjectKey(input.userId, id, 'txt');
    const jsonObjectKey = buildTranscriptObjectKey(input.userId, id, 'json');

    // Both transcript formats are written, exactly as the provider-callback
    // path does in `CompleteTranscription`. The download use case derives the
    // object key from the requested format alone, so a record that only ever
    // stored `.txt` would still hand the user a signed URL for a `.json`
    // object that was never written.
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
        // Two retries in flight at once: the other one claimed the session id
        // between the read above and this write. Returning what it stored is
        // the whole point — a retry must be indistinguishable from the call it
        // repeats, and answering with a conflict would push the client into
        // retrying again against a record that already exists.
        const claimed = await this.repository.findByClientSession(
          input.userId,
          input.clientSessionId,
        );
        if (claimed !== null) return toPublicTranscription(claimed.toPrimitives());
      }

      // Unreachable without a session id: this record was built around an id
      // generated moments ago, so nothing else can hold it and there is no
      // earlier revision to lose a race against. An invariant violation rather
      // than an outcome a caller must handle, so it throws — see
      // `StartFileTranscription` for the full reasoning behind that choice.
      throw new Error(
        `Invariant violated: SaveRealtimeTranscription could not persist a newly created transcription (${written.error.message})`,
      );
    }

    // The public DTO, not the entity: `toPrimitives()` carries `userId` and
    // three internal object keys, and the obvious handler — returning whatever
    // this resolves to — would publish all four from the microphone endpoint
    // while the history endpoint stayed carefully clean.
    return toPublicTranscription(transcription.toPrimitives());
  }
}
