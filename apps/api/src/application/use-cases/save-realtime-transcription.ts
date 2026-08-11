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
}

/**
 * Persists a finished microphone session as an already-`COMPLETED` record.
 * Unlike the file pipeline, there is no upload or provider job in between:
 * the transcript is produced client-side during the realtime session and
 * handed over complete, so there is no domain rule left to reject it — a
 * storage or repository failure here is infrastructure trouble, and
 * propagates as an exception rather than a `Result`.
 */
export class SaveRealtimeTranscription {
  constructor(
    private readonly repository: TranscriptionRepository,
    private readonly storage: FileStorage,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: SaveRealtimeTranscriptionInput): Promise<TranscriptionDto> {
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

    await this.repository.save(transcription);

    // The public DTO, not the entity: `toPrimitives()` carries `userId` and
    // three internal object keys, and the obvious handler — returning whatever
    // this resolves to — would publish all four from the microphone endpoint
    // while the history endpoint stayed carefully clean.
    return toPublicTranscription(transcription.toPrimitives());
  }
}
