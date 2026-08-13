import type { Clock } from '../../src/domain/ports/clock.js';
import type { FileStorage } from '../../src/domain/ports/file-storage.js';
import type { PresignedUpload } from '../../src/domain/types/audio.js';

type PresignedUploadInput = Parameters<FileStorage['createPresignedUpload']>[0];
type PresignedReadInput = Parameters<FileStorage['createPresignedRead']>[0];
type PresignedDownloadInput = Parameters<FileStorage['createPresignedDownload']>[0];
type PutTextInput = Parameters<FileStorage['putText']>[0];

export class InMemoryFileStorage implements FileStorage {
  /** One instance is one bucket, so this holds only that bucket's objects. */
  readonly objects = new Map<string, string>();
  readonly calls: {
    presignedUploads: (PresignedUploadInput & { bucketName: string })[];
    presignedReads: (PresignedReadInput & { bucketName: string })[];
    presignedDownloads: (PresignedDownloadInput & { bucketName: string })[];
    writes: (PutTextInput & { bucketName: string })[];
  } = { presignedUploads: [], presignedReads: [], presignedDownloads: [], writes: [] };

  /** Set to make the next call reject with this error; cleared after one use. */
  failNextWith?: Error | undefined;

  readonly bucketName: string;

  private readonly clock: Clock;

  constructor(options: { bucketName?: string; clock?: Clock } = {}) {
    this.bucketName = options.bucketName ?? 'in-memory-bucket';
    this.clock = options.clock ?? { now: (): Date => new Date() };
  }

  createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUpload> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.presignedUploads.push({ ...input, bucketName: this.bucketName });
    return Promise.resolve({
      // The bucket is in every URL, as it is in a real S3 endpoint: a signed
      // URL for the wrong bucket is a different URL, and a test should see it.
      url: `https://storage.test/${this.bucketName}`,
      fields: { key: input.objectKey, 'Content-Type': input.contentType },
      expiresAt: new Date(this.clock.now().getTime() + input.expiresInSeconds * 1_000),
    });
  }

  createPresignedRead(input: PresignedReadInput): Promise<string> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.presignedReads.push({ ...input, bucketName: this.bucketName });
    return Promise.resolve(`https://storage.test/read/${this.bucketName}/${input.objectKey}`);
  }

  createPresignedDownload(input: PresignedDownloadInput): Promise<string> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.presignedDownloads.push({ ...input, bucketName: this.bucketName });
    return Promise.resolve(`https://storage.test/download/${this.bucketName}/${input.objectKey}`);
  }

  putText(input: PutTextInput): Promise<void> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.writes.push({ ...input, bucketName: this.bucketName });
    this.objects.set(input.objectKey, input.body);
    return Promise.resolve();
  }

  private consumeFailure(): Error | undefined {
    const failure = this.failNextWith;
    this.failNextWith = undefined;
    return failure;
  }
}
