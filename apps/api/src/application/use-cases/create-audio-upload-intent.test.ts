import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import { CreateAudioUploadIntent } from './create-audio-upload-intent.js';
import { buildTranscription } from '../../../test/builders/transcription.builder.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';
import { InMemoryFileStorage } from '../../../test/doubles/in-memory-file-storage.js';
import { SequentialIdGenerator } from '../../../test/doubles/sequential-id-generator.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';

const AUDIO_BUCKET = 'audio-bucket';

const FIXED_NOW = new Date('2026-08-10T10:00:00.000Z');

function buildUseCase(): {
  useCase: CreateAudioUploadIntent;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
} {
  const repository = new InMemoryTranscriptionRepository();
  // Same clock as the use case, so the double's computed `expiresAt` is
  // deterministic and can be asserted exactly, not just checked for shape.
  const storage = new InMemoryFileStorage({
    bucketName: AUDIO_BUCKET,
    clock: new FixedClock(FIXED_NOW),
  });
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
};

describe('CreateAudioUploadIntent', () => {
  it('persists a pending transcription and returns a presigned upload', async () => {
    const { useCase, repository } = buildUseCase();

    const result = await useCase.execute(validInput);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value.transcriptionId).toBe('01ID001');
    expect(result.value.upload.fields['key']).toBe('audio/user-1/01ID001/visit.mp3');
    expect(result.value.upload.url).toBe(`https://storage.test/${AUDIO_BUCKET}`);
    // Hardcoded, not re-derived from UPLOAD_URL_TTL_SECONDS: pins the actual
    // response mapping rather than trivially re-confirming whatever the
    // implementation computed.
    expect(result.value.upload.expiresAt).toBe(
      new Date(FIXED_NOW.getTime() + 900_000).toISOString(),
    );

    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.status).toBe('PENDING_UPLOAD');
    expect(stored?.toPrimitives().createdAt).toBe(FIXED_NOW.toISOString());
    expect(stored?.toPrimitives().updatedAt).toBe(FIXED_NOW.toISOString());
  });

  it('requests the presigned upload with the platform-wide size cap, not the client-reported size', async () => {
    const { useCase, storage } = buildUseCase();

    const result = await useCase.execute({ ...validInput, sizeBytes: 2_048 });

    expect(result.success).toBe(true);
    expect(storage.calls.presignedUploads).toHaveLength(1);
    expect(storage.calls.presignedUploads[0]?.maxSizeBytes).toBe(MAX_AUDIO_FILE_SIZE_BYTES);
    expect(storage.calls.presignedUploads[0]?.objectKey).toBe('audio/user-1/01ID001/visit.mp3');
    expect(storage.calls.presignedUploads[0]?.contentType).toBe('audio/mpeg');
    // Hardcoded, not re-imported from UPLOAD_URL_TTL_SECONDS: a change to
    // that constant must be caught here, not silently absorbed. It stays a
    // literal now that the constant lives in application/constants.ts and is
    // one import away — importing it would make this
    // `expect(constant).toBe(constant)`, which pins nothing.
    expect(storage.calls.presignedUploads[0]?.expiresInSeconds).toBe(900);
  });

  /*
   * The record starts with no language at all, and that is the point: nobody
   * has heard the audio yet. Storing the old default here — Spanish, chosen by
   * a dropdown the uploader may never have looked at — is what let an English
   * recording be filed as Spanish and sent to the provider as Spanish. The
   * language arrives later, from the provider, in `CompleteTranscription`.
   */
  it('records no language, because none has been identified yet', async () => {
    const { useCase, repository } = buildUseCase();

    const result = await useCase.execute(validInput);

    expect(result.success).toBe(true);
    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.toPrimitives().language).toBeNull();
  });

  it('treats a collision on a freshly generated id as an invariant violation, not a caller error', async () => {
    const { useCase, repository } = buildUseCase();
    // Occupy the id the generator is about to hand out, so the insert loses
    // the conditional write. Nothing in production can do this — the id is
    // minted moments before the write and nothing else holds it — which is
    // why it throws rather than becoming an outcome every caller must handle.
    await repository.save(buildTranscription({ id: '01ID001', userId: 'user-1' }));

    await expect(useCase.execute(validInput)).rejects.toThrow('Invariant violated');
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

  it('rejects a traversal file name before it can be interpolated into an object key', async () => {
    const { useCase, repository, storage } = buildUseCase();

    const result = await useCase.execute({
      ...validInput,
      fileName: '../../user-2/01B/evil.mp3',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_NAME');
    }
    // Nothing was signed and nothing was stored, so no object key was ever
    // built from the name.
    expect(storage.calls.presignedUploads).toHaveLength(0);
    expect(await repository.findById('user-1', '01ID001')).toBeNull();
  });

  it('propagates a storage failure without persisting anything', async () => {
    const { useCase, repository, storage } = buildUseCase();
    storage.failNextWith = new Error('storage unavailable');

    await expect(useCase.execute(validInput)).rejects.toThrow('storage unavailable');

    // Presigning happens before saving, so a storage outage leaves no row
    // behind at all: the client gets a 5xx and simply retries, instead of
    // accumulating a fresh stranded PENDING_UPLOAD row on every retry.
    expect(await repository.findById('user-1', '01ID001')).toBeNull();
    const page = await repository.listByUser({ userId: 'user-1', limit: 10, cursor: null });
    expect(page.success).toBe(true);
    if (page.success) {
      expect(page.value.items).toHaveLength(0);
    }
  });

  it('propagates a repository failure after a presigned upload was already issued, leaving no residue', async () => {
    const { useCase, repository, storage } = buildUseCase();
    repository.failNextWith = new Error('repository unavailable');

    await expect(useCase.execute(validInput)).rejects.toThrow('repository unavailable');

    // The presigned upload was generated, but the response is only returned
    // after save succeeds too, so the client never receives it and never
    // holds a usable URL. The only other residue is a row that was never
    // persisted, which this confirms.
    expect(storage.calls.presignedUploads).toHaveLength(1);
    expect(await repository.findById('user-1', '01ID001')).toBeNull();
  });
});
