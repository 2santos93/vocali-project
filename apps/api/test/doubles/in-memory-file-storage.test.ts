import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import { FixedClock } from './fixed-clock.js';
import { InMemoryFileStorage } from './in-memory-file-storage.js';

const AT = new Date('2026-08-10T10:00:00.000Z');

describe('InMemoryFileStorage', () => {
  it('records every call with its full arguments', async () => {
    const storage = new InMemoryFileStorage(new FixedClock(AT));

    await storage.createPresignedUpload({
      objectKey: 'audio/user-1/01A/visit.mp3',
      contentType: 'audio/mpeg',
      maxSizeBytes: MAX_AUDIO_FILE_SIZE_BYTES,
      expiresInSeconds: 60,
    });
    await storage.createPresignedDownload({
      objectKey: 'transcripts/user-1/01A.txt',
      downloadFileName: 'visit.txt',
      expiresInSeconds: 60,
    });
    await storage.putText({
      objectKey: 'transcripts/user-1/01A.txt',
      body: 'the patient reports mild pain',
      contentType: 'text/plain',
    });

    expect(storage.calls.presignedUploads[0]?.maxSizeBytes).toBe(MAX_AUDIO_FILE_SIZE_BYTES);
    expect(storage.calls.presignedDownloads[0]?.downloadFileName).toBe('visit.txt');
    expect(storage.calls.writes[0]?.contentType).toBe('text/plain');
  });

  it('derives expiresAt from the injected clock, not the system clock', async () => {
    const storage = new InMemoryFileStorage(new FixedClock(AT));

    const upload = await storage.createPresignedUpload({
      objectKey: 'audio/user-1/01A/visit.mp3',
      contentType: 'audio/mpeg',
      maxSizeBytes: MAX_AUDIO_FILE_SIZE_BYTES,
      expiresInSeconds: 60,
    });

    expect(upload.expiresAt).toEqual(new Date('2026-08-10T10:01:00.000Z'));
  });

  it('rejects with the injected failure and clears it after one use', async () => {
    const storage = new InMemoryFileStorage();
    const failure = new Error('bucket unavailable');
    storage.failNextWith = failure;

    await expect(
      storage.putText({ objectKey: 'k', body: 'v', contentType: 'text/plain' }),
    ).rejects.toThrow(failure);

    await expect(
      storage.putText({ objectKey: 'k', body: 'v', contentType: 'text/plain' }),
    ).resolves.toBeUndefined();
  });
});
