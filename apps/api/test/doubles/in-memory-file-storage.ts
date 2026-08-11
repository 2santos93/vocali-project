import type { FileStorage, PresignedUpload } from '../../src/domain/ports/file-storage.js';

export class InMemoryFileStorage implements FileStorage {
  readonly objects = new Map<string, string>();

  createPresignedUpload(input: {
    objectKey: string;
    contentType: string;
    maxSizeBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload> {
    return Promise.resolve({
      url: 'https://storage.test/bucket',
      fields: { key: input.objectKey, 'Content-Type': input.contentType },
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000),
    });
  }

  createPresignedRead(input: { objectKey: string }): Promise<string> {
    return Promise.resolve(`https://storage.test/read/${input.objectKey}`);
  }

  createPresignedDownload(input: { objectKey: string }): Promise<string> {
    return Promise.resolve(`https://storage.test/download/${input.objectKey}`);
  }

  putText(input: { objectKey: string; body: string }): Promise<void> {
    this.objects.set(input.objectKey, input.body);
    return Promise.resolve();
  }
}
