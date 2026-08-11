import {
  buildProviderCallbackUrl,
  parseAudioObjectKey,
  StartFileTranscription,
} from './start-file-transcription.js';
import { buildTranscription } from '../../../test/builders/transcription.builder.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';
import { InMemoryFileStorage } from '../../../test/doubles/in-memory-file-storage.js';
import { FakeTranscriptionProvider } from '../../../test/doubles/fake-transcription-provider.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';
import { SilentLogger } from '../../../test/doubles/silent-logger.js';

const CALLBACK_BASE_URL = 'https://api.test/webhooks/transcription-provider';
const NOW = new Date('2026-08-10T10:05:00.000Z');

function buildUseCase(): {
  useCase: StartFileTranscription;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
  provider: FakeTranscriptionProvider;
} {
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage();
  const provider = new FakeTranscriptionProvider();
  const useCase = new StartFileTranscription(
    repository,
    storage,
    provider,
    new FixedClock(NOW),
    new SilentLogger(),
    { callbackBaseUrl: CALLBACK_BASE_URL },
  );
  return { useCase, repository, storage, provider };
}

describe('buildProviderCallbackUrl', () => {
  it('appends the transcription id and user id as query parameters', () => {
    const url = buildProviderCallbackUrl(CALLBACK_BASE_URL, {
      userId: 'user-1',
      transcriptionId: '01A',
    });

    expect(url).toBe(
      'https://api.test/webhooks/transcription-provider?transcriptionId=01A&userId=user-1',
    );
  });
});

describe('parseAudioObjectKey', () => {
  it('extracts the user and transcription ids from a well-formed key', () => {
    expect(parseAudioObjectKey('audio/user-1/01A/visit.mp3')).toEqual({
      userId: 'user-1',
      transcriptionId: '01A',
    });
  });

  it('returns null for a key without the audio prefix', () => {
    expect(parseAudioObjectKey('transcripts/user-1/01A/visit.txt')).toBeNull();
  });

  it('returns null for a key missing the transcription id segment', () => {
    expect(parseAudioObjectKey('audio/user-1')).toBeNull();
  });

  it('returns null for a key with fewer than four segments even with a prefix and ids', () => {
    expect(parseAudioObjectKey('audio/user-1/01A')).toBeNull();
  });

  it('returns null for a key with an empty user id segment', () => {
    expect(parseAudioObjectKey('audio//01A/visit.mp3')).toBeNull();
  });

  it('returns null for a key of entirely empty segments', () => {
    expect(parseAudioObjectKey('audio///')).toBeNull();
  });

  it('parses a key with extra trailing segments structurally, leaving rejection to the caller', () => {
    // The parser is deliberately permissive here: it has at least four
    // non-empty segments, so it parses. `StartFileTranscription.execute`
    // is what actually rejects this, by comparing the full key against the
    // record's own `audioObjectKey`.
    expect(parseAudioObjectKey('audio/user-1/01A/sub/dir/visit.mp3')).toEqual({
      userId: 'user-1',
      transcriptionId: '01A',
    });
  });
});

describe('StartFileTranscription', () => {
  it('submits the job with a readable audio url and records the job id', async () => {
    const { useCase, repository, storage, provider } = buildUseCase();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    const result = await useCase.execute({ audioObjectKey: 'audio/user-1/01A/visit.mp3' });

    expect(result.success).toBe(true);
    expect(provider.submissions).toHaveLength(1);
    expect(provider.submissions[0]?.audioUrl).toBe(
      'https://storage.test/read/audio/user-1/01A/visit.mp3',
    );
    expect(provider.submissions[0]?.language).toBe('es');
    expect(provider.submissions[0]?.callbackUrl).toBe(
      'https://api.test/webhooks/transcription-provider?transcriptionId=01A&userId=user-1',
    );
    expect(storage.calls.presignedReads).toHaveLength(1);
    expect(storage.calls.presignedReads[0]?.objectKey).toBe('audio/user-1/01A/visit.mp3');
    // Hardcoded, not re-imported from the source constant: if
    // AUDIO_READ_URL_TTL_SECONDS were ever changed without updating this
    // assertion, this must fail rather than silently track the change.
    expect(storage.calls.presignedReads[0]?.expiresInSeconds).toBe(3_600);

    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('PROCESSING');
    expect(stored?.externalJobId).toBe('job-1');
    expect(stored?.toPrimitives().updatedAt).toBe(NOW.toISOString());
  });

  it('rejects an object key whose user and transcription ids match a record but whose file name does not', async () => {
    const { useCase, repository, storage, provider } = buildUseCase();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    // Same prefix and ids as the real record (created for visit.mp3), but a
    // different file name: this must not resolve to that record.
    const result = await useCase.execute({
      audioObjectKey: 'audio/user-1/01A/a-different-file.mp3',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
    }
    expect(storage.calls.presignedReads).toHaveLength(0);
    expect(provider.submissions).toHaveLength(0);

    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('PENDING_UPLOAD');
  });

  it('fails when the object key does not match a known transcription, without contacting storage or the provider', async () => {
    const { useCase, storage, provider } = buildUseCase();

    const result = await useCase.execute({ audioObjectKey: 'audio/user-1/missing/visit.mp3' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
    }
    expect(storage.calls.presignedReads).toHaveLength(0);
    expect(provider.submissions).toHaveLength(0);
  });

  it('fails when the object key is structurally malformed', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ audioObjectKey: 'not-audio/user-1' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
    }
  });

  it('acknowledges a redelivered event for a transcription already processing without submitting a second job', async () => {
    const { useCase, repository, storage, provider } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-earlier', new Date('2026-08-10T10:01:00.000Z'));
    await repository.save(transcription);

    const result = await useCase.execute({ audioObjectKey: 'audio/user-1/01A/visit.mp3' });

    expect(result.success).toBe(true);
    expect(provider.submissions).toHaveLength(0);
    expect(storage.calls.presignedReads).toHaveLength(0);

    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('PROCESSING');
    expect(stored?.externalJobId).toBe('job-earlier');
  });

  it('acknowledges a redelivered event for a transcription that already completed', async () => {
    const { useCase, repository, provider } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    transcription.markAsCompleted({
      transcriptObjectKey: 'transcripts/user-1/01A.txt',
      text: 'done',
      durationSeconds: 42,
      at: new Date('2026-08-10T10:02:00.000Z'),
    });
    await repository.save(transcription);

    const result = await useCase.execute({ audioObjectKey: 'audio/user-1/01A/visit.mp3' });

    expect(result.success).toBe(true);
    expect(provider.submissions).toHaveLength(0);

    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('COMPLETED');
  });

  it('propagates a provider failure, leaving the transcription stranded in its prior status', async () => {
    const { useCase, repository, provider } = buildUseCase();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));
    provider.failNextWith = new Error('provider unavailable');

    await expect(useCase.execute({ audioObjectKey: 'audio/user-1/01A/visit.mp3' })).rejects.toThrow(
      'provider unavailable',
    );

    // No job was recorded and the status was never advanced, so a retry of
    // the same S3 event will attempt submission again rather than being
    // treated as a duplicate.
    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('PENDING_UPLOAD');
    expect(stored?.externalJobId).toBeNull();
  });

  it('propagates a repository lookup failure without contacting the provider', async () => {
    const { useCase, repository, provider } = buildUseCase();
    repository.failNextWith = new Error('repository unavailable');

    await expect(useCase.execute({ audioObjectKey: 'audio/user-1/01A/visit.mp3' })).rejects.toThrow(
      'repository unavailable',
    );

    expect(provider.submissions).toHaveLength(0);
  });

  it('orphans the submitted job when persisting PROCESSING fails after the provider already accepted it', async () => {
    const { useCase, repository, provider } = buildUseCase();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));
    repository.failOn('save', new Error('write throttled'));

    await expect(useCase.execute({ audioObjectKey: 'audio/user-1/01A/visit.mp3' })).rejects.toThrow(
      'write throttled',
    );

    // The provider already has the job — it was never rolled back — but the
    // repository still shows PENDING_UPLOAD with no externalJobId, because
    // the save that would have recorded PROCESSING failed. A retry of the
    // same S3 event does not treat this as a duplicate (status is still
    // PENDING_UPLOAD) and submits a second job, so the first is orphaned:
    // the provider will eventually call back with an externalJobId that was
    // never stored. Recovering that case is why the callback URL carries
    // (userId, transcriptionId) instead of relying solely on externalJobId
    // (see buildProviderCallbackUrl): the webhook handler can still find the
    // record by primary key and fill in externalJobId there.
    expect(provider.submissions).toHaveLength(1);
    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('PENDING_UPLOAD');
    expect(stored?.externalJobId).toBeNull();
  });
});
