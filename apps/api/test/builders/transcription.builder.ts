import type { TranscriptionLanguage } from '@vocali/contracts/constants';
import { Transcription } from '../../src/domain/entities/transcription.js';
import { AudioFile } from '../../src/domain/value-objects/audio-file.js';

interface BuilderOverrides {
  readonly id?: string;
  readonly userId?: string;
  readonly language?: TranscriptionLanguage;
  readonly createdAt?: Date;
}

export function buildTranscription(overrides: BuilderOverrides = {}): Transcription {
  const audioFileResult = AudioFile.create({
    fileName: 'visit.mp3',
    contentType: 'audio/mpeg',
    sizeBytes: 2_048,
  });
  if (!audioFileResult.success) throw new Error('fixture must be valid');

  const id = overrides.id ?? '01DEFAULT';
  const userId = overrides.userId ?? 'user-1';

  return Transcription.createForFileUpload({
    id,
    userId,
    audioFile: audioFileResult.value,
    audioObjectKey: `audio/${userId}/${id}/visit.mp3`,
    language: overrides.language ?? 'es',
    createdAt: overrides.createdAt ?? new Date('2026-08-10T10:00:00.000Z'),
  });
}
