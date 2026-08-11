import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import { buildAudioObjectKey, CreateAudioUploadIntent } from './create-audio-upload-intent.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';
import { InMemoryFileStorage } from '../../../test/doubles/in-memory-file-storage.js';
import { SequentialIdGenerator } from '../../../test/doubles/sequential-id-generator.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';

const FIXED_NOW = new Date('2026-08-10T10:00:00.000Z');

function buildUseCase(): {
  useCase: CreateAudioUploadIntent;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
} {
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage();
  const useCase = new CreateAudioUploadIntent(
    repository,
    storage,
    new SequentialIdGenerator(),
    new FixedClock(FIXED_NOW),
  );
  return { useCase, repository, storage };
}

const validInput = {
  userId: 'user-1',
  fileName: 'visit.mp3',
  contentType: 'audio/mpeg',
  sizeBytes: 2_048,
  language: 'es',
};

describe('buildAudioObjectKey', () => {
  it('joins the user, transcription and file name under the audio prefix', () => {
    expect(buildAudioObjectKey('user-1', '01ID001', 'visit.mp3')).toBe(
      'audio/user-1/01ID001/visit.mp3',
    );
  });
});

describe('CreateAudioUploadIntent', () => {
  it('persists a pending transcription and returns a presigned upload', async () => {
    const { useCase, repository } = buildUseCase();

    const result = await useCase.execute(validInput);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value.transcriptionId).toBe('01ID001');
    expect(result.value.upload.fields['key']).toBe('audio/user-1/01ID001/visit.mp3');

    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.status).toBe('PENDING_UPLOAD');
  });

  it('requests the presigned upload with the platform-wide size cap, not the client-reported size', async () => {
    const { useCase, storage } = buildUseCase();

    const result = await useCase.execute({ ...validInput, sizeBytes: 2_048 });

    expect(result.success).toBe(true);
    expect(storage.calls.presignedUploads).toHaveLength(1);
    expect(storage.calls.presignedUploads[0]?.maxSizeBytes).toBe(MAX_AUDIO_FILE_SIZE_BYTES);
    expect(storage.calls.presignedUploads[0]?.objectKey).toBe('audio/user-1/01ID001/visit.mp3');
    expect(storage.calls.presignedUploads[0]?.contentType).toBe('audio/mpeg');
  });

  it('rejects an unsupported format without persisting anything or contacting storage', async () => {
    const { useCase, repository, storage } = buildUseCase();

    const result = await useCase.execute({ ...validInput, contentType: 'application/zip' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNSUPPORTED_AUDIO_FORMAT');
    }
    const page = await repository.listByUser({ userId: 'user-1', limit: 10, cursor: null });
    expect(page.success).toBe(true);
    if (page.success) {
      expect(page.value.items).toHaveLength(0);
    }
    expect(storage.calls.presignedUploads).toHaveLength(0);
  });

  it('rejects a file above the size limit without persisting anything', async () => {
    const { useCase, repository } = buildUseCase();

    const result = await useCase.execute({
      ...validInput,
      sizeBytes: MAX_AUDIO_FILE_SIZE_BYTES + 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('AUDIO_FILE_TOO_LARGE');
    }
    const page = await repository.listByUser({ userId: 'user-1', limit: 10, cursor: null });
    expect(page.success).toBe(true);
    if (page.success) {
      expect(page.value.items).toHaveLength(0);
    }
  });

  it('rejects a non-positive size as an invalid audio file, distinct from the too-large case', async () => {
    const { useCase, repository } = buildUseCase();

    const result = await useCase.execute({ ...validInput, sizeBytes: 0 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_SIZE');
    }
    const page = await repository.listByUser({ userId: 'user-1', limit: 10, cursor: null });
    expect(page.success).toBe(true);
    if (page.success) {
      expect(page.value.items).toHaveLength(0);
    }
  });

  it('propagates a repository failure without contacting storage', async () => {
    const { useCase, repository, storage } = buildUseCase();
    repository.failNextWith = new Error('repository unavailable');

    await expect(useCase.execute(validInput)).rejects.toThrow('repository unavailable');

    expect(storage.calls.presignedUploads).toHaveLength(0);
  });

  it('leaves the record stranded in PENDING_UPLOAD when storage fails after it was saved', async () => {
    const { useCase, repository, storage } = buildUseCase();
    storage.failNextWith = new Error('storage unavailable');

    await expect(useCase.execute(validInput)).rejects.toThrow('storage unavailable');

    // The transcription was already saved before the storage call, so a
    // storage outage leaves it behind as PENDING_UPLOAD. That is acceptable:
    // the client never received an upload URL, so it cannot complete this
    // attempt, and a reconciler sweeps records that never leave
    // PENDING_UPLOAD within its staleness window.
    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.status).toBe('PENDING_UPLOAD');
    expect(stored?.audioObjectKey).toBe('audio/user-1/01ID001/visit.mp3');
  });
});
