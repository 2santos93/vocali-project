import { Transcription } from '../../domain/entities/transcription.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { IdGenerator } from '../../domain/ports/id-generator.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { buildTranscriptObjectKey } from './object-keys.js';

interface SaveRealtimeTranscriptionInput {
  readonly userId: string;
  readonly text: string;
  readonly durationSeconds: number;
  readonly language: string;
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

  async execute(input: SaveRealtimeTranscriptionInput): Promise<Transcription> {
    const id = this.idGenerator.next();
    const transcriptObjectKey = buildTranscriptObjectKey(input.userId, id, 'txt');

    await this.storage.putText({
      objectKey: transcriptObjectKey,
      body: input.text,
      contentType: 'text/plain',
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

    return transcription;
  }
}
