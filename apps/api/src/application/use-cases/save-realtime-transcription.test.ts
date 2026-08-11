import { SaveRealtimeTranscription } from './save-realtime-transcription.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';
import { InMemoryFileStorage } from '../../../test/doubles/in-memory-file-storage.js';
import { SequentialIdGenerator } from '../../../test/doubles/sequential-id-generator.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';

const NOW = new Date('2026-08-10T10:00:00.000Z');

function buildUseCase(): {
  useCase: SaveRealtimeTranscription;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
} {
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage();
  const useCase = new SaveRealtimeTranscription(
    repository,
    storage,
    new SequentialIdGenerator(),
    new FixedClock(NOW),
  );
  return { useCase, repository, storage };
}

const validInput = {
  userId: 'user-1',
  text: 'the patient reports mild pain',
  durationSeconds: 37,
  language: 'es',
};

describe('SaveRealtimeTranscription', () => {
  it('persists a completed microphone-sourced record and writes the transcript to storage', async () => {
    const { useCase, repository, storage } = buildUseCase();

    const transcription = await useCase.execute(validInput);

    expect(transcription.status).toBe('COMPLETED');
    expect(transcription.toPrimitives().source).toBe('MICROPHONE');
    expect(transcription.toPrimitives().durationSeconds).toBe(37);
    expect(storage.objects.get('transcripts/user-1/01ID001.txt')).toBe(
      'the patient reports mild pain',
    );

    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.toPrimitives().source).toBe('MICROPHONE');
  });

  it('propagates a storage failure without persisting a record', async () => {
    const { useCase, repository, storage } = buildUseCase();
    storage.failNextWith = new Error('storage unavailable');

    await expect(useCase.execute(validInput)).rejects.toThrow('storage unavailable');

    expect(await repository.findById('user-1', '01ID001')).toBeNull();
  });

  it('propagates a repository failure after the transcript was already written', async () => {
    const { useCase, repository, storage } = buildUseCase();
    repository.failNextWith = new Error('write throttled');

    await expect(useCase.execute(validInput)).rejects.toThrow('write throttled');

    // The transcript text is already in storage even though the record was
    // never persisted: a known gap, not exercised further here.
    expect(storage.objects.get('transcripts/user-1/01ID001.txt')).toBe(
      'the patient reports mild pain',
    );
  });
});
