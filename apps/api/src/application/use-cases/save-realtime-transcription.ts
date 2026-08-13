import type { Transcription as TranscriptionDto } from '@vocali/contracts';
import { Transcription } from '../../domain/entities/transcription.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { IdGenerator } from '../../domain/ports/id-generator.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import type { SaveRealtimeTranscriptionInput } from '../types/transcription-inputs.js';
import { buildTranscriptObjectKey } from './object-keys.js';
import { toPublicTranscription } from './public-transcription.js';

export class SaveRealtimeTranscription {
  constructor(
    private readonly repository: TranscriptionRepository,
    private readonly storage: FileStorage,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: SaveRealtimeTranscriptionInput): Promise<TranscriptionDto> {
    if (input.clientSessionId !== undefined) {
      const claimed = await this.repository.findByClientSession(
        input.userId,
        input.clientSessionId,
      );
      if (claimed !== null) return toPublicTranscription(claimed.toPrimitives());
    }

    const id = this.idGenerator.next();
    const transcriptObjectKey = buildTranscriptObjectKey(input.userId, id, 'txt');
    const jsonObjectKey = buildTranscriptObjectKey(input.userId, id, 'json');

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
        const claimed = await this.repository.findByClientSession(
          input.userId,
          input.clientSessionId,
        );
        if (claimed !== null) return toPublicTranscription(claimed.toPrimitives());
      }

      throw new Error(
        `Invariant violated: SaveRealtimeTranscription could not persist a newly created transcription (${written.error.message})`,
      );
    }

    return toPublicTranscription(transcription.toPrimitives());
  }
}
