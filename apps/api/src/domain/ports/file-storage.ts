import type { PresignedUpload } from '../types/presigned-upload.js';

export interface FileStorage {
  createPresignedUpload(input: {
    objectKey: string;
    contentType: string;
    maxSizeBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload>;
  createPresignedRead(input: { objectKey: string; expiresInSeconds: number }): Promise<string>;
  createPresignedDownload(input: {
    objectKey: string;
    downloadFileName: string;
    expiresInSeconds: number;
  }): Promise<string>;
  putText(input: { objectKey: string; body: string; contentType: string }): Promise<void>;
}
