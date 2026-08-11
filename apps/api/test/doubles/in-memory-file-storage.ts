import type { Clock } from '../../src/domain/ports/clock.js';
import type { FileStorage, PresignedUpload } from '../../src/domain/ports/file-storage.js';

type PresignedUploadInput = Parameters<FileStorage['createPresignedUpload']>[0];
type PresignedReadInput = Parameters<FileStorage['createPresignedRead']>[0];
type PresignedDownloadInput = Parameters<FileStorage['createPresignedDownload']>[0];
type PutTextInput = Parameters<FileStorage['putText']>[0];

/**
 * Records every call with its full arguments, exactly as the port declares
 * them, so a test can assert on anything a use case passed through —
 * including the platform's size and content-type constraints (e.g.
 * `maxSizeBytes === MAX_AUDIO_FILE_SIZE_BYTES`).
 */
export class InMemoryFileStorage implements FileStorage {
  readonly objects = new Map<string, string>();
  readonly calls: {
    presignedUploads: PresignedUploadInput[];
    presignedReads: PresignedReadInput[];
    presignedDownloads: PresignedDownloadInput[];
    writes: PutTextInput[];
  } = { presignedUploads: [], presignedReads: [], presignedDownloads: [], writes: [] };

  /** Set to make the next call reject with this error; cleared after one use. */
  failNextWith?: Error | undefined;

  constructor(private readonly clock: Clock = { now: (): Date => new Date() }) {}

  createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUpload> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.presignedUploads.push(input);
    return Promise.resolve({
      url: 'https://storage.test/bucket',
      fields: { key: input.objectKey, 'Content-Type': input.contentType },
      expiresAt: new Date(this.clock.now().getTime() + input.expiresInSeconds * 1_000),
    });
  }

  createPresignedRead(input: PresignedReadInput): Promise<string> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.presignedReads.push(input);
    return Promise.resolve(`https://storage.test/read/${input.objectKey}`);
  }

  createPresignedDownload(input: PresignedDownloadInput): Promise<string> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.presignedDownloads.push(input);
    return Promise.resolve(`https://storage.test/download/${input.objectKey}`);
  }

  putText(input: PutTextInput): Promise<void> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.writes.push(input);
    this.objects.set(input.objectKey, input.body);
    return Promise.resolve();
  }

  private consumeFailure(): Error | undefined {
    const failure = this.failNextWith;
    this.failNextWith = undefined;
    return failure;
  }
}
