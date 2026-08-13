import { SaveRealtimeTranscription } from '../save-realtime-transcription.js';
import { PUBLIC_TRANSCRIPTION_FIELDS } from '../../../../test-support/public-transcription-fields.js';
import { buildTranscription } from '../../../../test-support/builders/transcription.builder.js';
import { InMemoryTranscriptionRepository } from '../../../../test-support/doubles/in-memory-transcription-repository.js';
import { InMemoryFileStorage } from '../../../../test-support/doubles/in-memory-file-storage.js';
import { SequentialIdGenerator } from '../../../../test-support/doubles/sequential-id-generator.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';

const TRANSCRIPTS_BUCKET = 'transcripts-bucket';

const NOW = new Date('2026-08-10T10:00:00.000Z');

function buildUseCase(): {
  useCase: SaveRealtimeTranscription;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
} {
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage({ bucketName: TRANSCRIPTS_BUCKET });
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
    // format alone, so a record that wrote only `.txt` would still return a
    // signed URL for a `.json` that does not exist.
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

    // Returning the entity instead would hand a handler `userId`,
    // `audioObjectKey`, `transcriptObjectKey` and `externalJobId` to publish.
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

  it('treats a collision on a freshly generated id as an invariant violation, not a caller error', async () => {
    const { useCase, repository } = buildUseCase();
    // The id is minted moments before the write, so a lost conditional write
    // cannot happen in production and must not be an ordinary failure.
    await repository.save(buildTranscription({ id: '01ID001', userId: 'user-1' }));

    await expect(useCase.execute(validInput)).rejects.toThrow('Invariant violated');
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

    // Known gap: the transcript text is in storage even though the record was
    // never persisted.
    expect(storage.objects.get('transcripts/user-1/01ID001.txt')).toBe(
      'the patient reports mild pain',
    );
  });

  describe('with a client session id', () => {
    const retried = { ...validInput, clientSessionId: 'session-abc' };

    async function historyIds(repository: InMemoryTranscriptionRepository): Promise<string[]> {
      const page = await repository.listByUser({ userId: 'user-1', limit: 10, cursor: null });
      if (!page.success) throw new Error('the history could not be read');

      return page.value.items.map((item) => item.id);
    }

    it('returns the original transcription when the same session is saved again', async () => {
      const { useCase, repository, storage } = buildUseCase();

      const first = await useCase.execute(retried);
      const second = await useCase.execute(retried);

      // Indistinguishable from the first call, which is the requirement: no
      // second entry appears in the history.
      expect(second).toEqual(first);
      expect(await historyIds(repository)).toEqual(['01ID001']);
      expect(storage.calls.writes).toHaveLength(2);
    });

    it('keeps the generated ULID as the record id rather than the client session id', async () => {
      const { useCase, repository } = buildUseCase();

      const transcription = await useCase.execute(retried);

      // Deriving the id from the session id is the obvious shortcut and it
      // breaks the history: ids are ULIDs precisely so that sort-key order is
      // chronological order, and a client-chosen id orders arbitrarily.
      expect(transcription.id).toBe('01ID001');
      expect(await repository.findById('user-1', 'session-abc')).toBeNull();
    });

    it('stores a separate transcription for each distinct session', async () => {
      const { useCase, repository } = buildUseCase();

      await useCase.execute({ ...retried, clientSessionId: 'session-abc' });
      await useCase.execute({ ...retried, clientSessionId: 'session-def' });

      expect(await historyIds(repository)).toEqual(['01ID002', '01ID001']);
    });

    it('stores a separate transcription each time when no session id is given', async () => {
      const { useCase, repository } = buildUseCase();

      // Two identical dictations are two dictations. Without a key from the
      // client there is nothing that says otherwise, and collapsing them on
      // their content would silently discard a genuine second recording.
      await useCase.execute(validInput);
      await useCase.execute(validInput);

      expect(await historyIds(repository)).toEqual(['01ID002', '01ID001']);
    });

    it('keeps one user session id from resolving another user record', async () => {
      const { useCase, repository } = buildUseCase();

      const mine = await useCase.execute(retried);
      const theirs = await useCase.execute({ ...retried, userId: 'user-2' });

      // Claims live in the owner's partition, so two users picking the same
      // session id cannot hand one of them the other's transcription.
      expect(theirs.id).not.toBe(mine.id);
      expect(await repository.findById('user-2', theirs.id)).not.toBeNull();
    });

    it('returns the winning transcription when a concurrent retry claimed the session first', async () => {
      const repository = new LateClaimVisibilityRepository();
      const storage = new InMemoryFileStorage({ bucketName: TRANSCRIPTS_BUCKET });
      const useCase = new SaveRealtimeTranscription(
        repository,
        storage,
        new SequentialIdGenerator(),
        new FixedClock(NOW),
      );

      const first = await useCase.execute(retried);
      // The second attempt reads before the first commits, so it gets as far
      // as the write and loses there. Only the transaction can decide this;
      // the read ahead of it is an optimisation, not the control.
      repository.hideNextClaim();
      const second = await useCase.execute(retried);

      expect(second).toEqual(first);
      const page = await repository.listByUser({ userId: 'user-1', limit: 10, cursor: null });
      expect(page.success && page.value.items).toHaveLength(1);
      expect(await repository.findById('user-1', '01ID002')).toBeNull();
    });
  });
});

/**
 * Models the window the transaction exists to close: a retry whose lookup runs
 * before the first attempt commits sees no claim, and has to be stopped by the
 * conditional write rather than by that lookup.
 */
class LateClaimVisibilityRepository extends InMemoryTranscriptionRepository {
  private hideNext = false;

  hideNextClaim(): void {
    this.hideNext = true;
  }

  override findByClientSession(
    userId: string,
    clientSessionId: string,
  ): ReturnType<InMemoryTranscriptionRepository['findByClientSession']> {
    if (this.hideNext) {
      this.hideNext = false;
      return Promise.resolve(null);
    }

    return super.findByClientSession(userId, clientSessionId);
  }
}
