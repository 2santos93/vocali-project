import { SaveRealtimeTranscription } from './save-realtime-transcription.js';
import { PUBLIC_TRANSCRIPTION_FIELDS } from '../../../test/public-transcription-fields.js';
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
  language: 'es' as const,
};

describe('SaveRealtimeTranscription', () => {
  it('persists a completed microphone-sourced record and writes the transcript to storage', async () => {
    const { useCase, repository, storage } = buildUseCase();

    const transcription = await useCase.execute(validInput);

    expect(transcription.status).toBe('COMPLETED');
    expect(transcription.source).toBe('MICROPHONE');
    expect(transcription.durationSeconds).toBe(37);
    expect(storage.objects.get('transcripts/user-1/01ID001.txt')).toBe(
      'the patient reports mild pain',
    );

    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.toPrimitives().source).toBe('MICROPHONE');
  });

  it('writes both transcript formats, so a json download resolves to a real object', async () => {
    const { useCase, storage } = buildUseCase();

    await useCase.execute(validInput);

    // GetTranscriptionDownloadUrl derives the object key from the requested
    // format alone and never reads the record's stored key, so a microphone
    // record that only wrote `.txt` would still return a signed URL for a
    // `.json` object that does not exist. Both completion paths must leave
    // storage in the same state.
    expect(storage.objects.get('transcripts/user-1/01ID001.txt')).toBe(
      'the patient reports mild pain',
    );
    const jsonBody = storage.objects.get('transcripts/user-1/01ID001.json');
    expect(jsonBody).toBeDefined();
    expect(JSON.parse(jsonBody ?? '')).toEqual({
      text: 'the patient reports mild pain',
      durationSeconds: 37,
    });
    expect(storage.calls.writes[1]?.contentType).toBe('application/json');
  });

  it('returns only the public fields, omitting userId and every internal object key', async () => {
    const { useCase } = buildUseCase();

    const transcription = await useCase.execute(validInput);

    // The same field-set assertion the history use case carries. Returning the
    // entity here instead would hand a handler `userId`, `audioObjectKey`,
    // `transcriptObjectKey` and `externalJobId` to publish by accident.
    expect(Object.keys(transcription).sort()).toEqual(PUBLIC_TRANSCRIPTION_FIELDS);
    expect(transcription).not.toHaveProperty('userId');
    expect(transcription).not.toHaveProperty('transcriptObjectKey');
  });

  it('persists the language the session was recorded in rather than defaulting it', async () => {
    const { useCase, repository } = buildUseCase();

    await useCase.execute({ ...validInput, language: 'ca' });

    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.toPrimitives().language).toBe('ca');
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
