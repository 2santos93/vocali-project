import type { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { PresignedUpload } from '../../domain/types/presigned-upload.js';

/**
 * Anything that could close the quote of a `Content-Disposition` value, escape
 * it, or start a new header line. `\p{C}` covers CR, LF, NUL and the rest of
 * the control categories while leaving letters and combining diacritics alone,
 * so Spanish clinical file names keep their accents.
 */
const UNSAFE_DOWNLOAD_NAME_CHARACTERS = /[\p{C}"\\/]/gu;

const MAX_DOWNLOAD_FILE_NAME_LENGTH = 200;

/** Used when sanitisation leaves nothing, so the header is never malformed. */
const FALLBACK_DOWNLOAD_FILE_NAME = 'transcript';

export class S3FileStorage implements FileStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
    private readonly clock: Clock,
  ) {}

  /**
   * A presigned POST rather than a PUT, because only a POST policy can carry a
   * `content-length-range`. A PUT signature commits to a key and nothing else,
   * which would leave the size cap enforced solely by request-body validation
   * a client is free to lie to. The policy has S3 enforce it on the bytes sent.
   */
  async createPresignedUpload(input: {
    objectKey: string;
    contentType: string;
    maxSizeBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucketName,
      Key: input.objectKey,
      Expires: input.expiresInSeconds,
      // A field is also an exact-match policy condition, so the client cannot
      // substitute a format other than the one validated.
      Fields: { 'Content-Type': input.contentType },
      Conditions: [
        // The lower bound rejects an empty object, which would otherwise create
        // a record that can never be transcribed.
        ['content-length-range', 1, input.maxSizeBytes],
        // Exact match, never `starts-with`. The server chooses this key from
        // the authenticated user's `sub` and `StartFileTranscription` reads the
        // owner back out of it, so a prefix condition would hand key selection
        // to the client and let it land an upload on another user's path.
        { key: input.objectKey },
      ],
    });

    return {
      url,
      fields,
      expiresAt: new Date(this.clock.now().getTime() + input.expiresInSeconds * 1_000),
    };
  }

  createPresignedRead(input: { objectKey: string; expiresInSeconds: number }): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucketName, Key: input.objectKey });

    return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
  }

  createPresignedDownload(input: {
    objectKey: string;
    downloadFileName: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: input.objectKey,
      ResponseContentDisposition: buildContentDisposition(input.downloadFileName),
    });

    return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
  }

  async putText(input: { objectKey: string; body: string; contentType: string }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: input.objectKey,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }
}

/**
 * S3 echoes `response-content-disposition` straight back as a response header,
 * so an unsanitised name is a header-injection vector. Stripped rather than
 * escaped: escaping puts what a client may express in the hands of whoever
 * next edits the escape table.
 */
function buildContentDisposition(downloadFileName: string): string {
  const sanitised = downloadFileName
    .replace(UNSAFE_DOWNLOAD_NAME_CHARACTERS, '')
    .trim()
    .slice(0, MAX_DOWNLOAD_FILE_NAME_LENGTH);

  return `attachment; filename="${sanitised === '' ? FALLBACK_DOWNLOAD_FILE_NAME : sanitised}"`;
}
