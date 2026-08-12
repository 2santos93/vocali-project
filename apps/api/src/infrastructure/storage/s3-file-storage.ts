import type { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage, PresignedUpload } from '../../domain/ports/file-storage.js';

/**
 * Everything a client may ask for as a download name has to survive the
 * quoted-string form of `Content-Disposition`, so anything that could close
 * the quote, escape it or start a new header line is removed rather than
 * escaped. What a browser may send as an upload name is a separate question,
 * answered by `SafeFileNameSchema`.
 *
 * `\p{C}` covers CR, LF, NUL and the rest of the control and format categories
 * while leaving letters and combining diacritics alone, so Spanish clinical
 * file names keep their accents.
 */
const UNSAFE_DOWNLOAD_NAME_CHARACTERS = /[\p{C}"\\/]/gu;

/** Long enough for any real clinical file name, short enough to bound the header. */
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
   * A presigned POST rather than a presigned PUT, because only a POST policy
   * can carry a `content-length-range`. A PUT signature commits to a key and
   * nothing else: the client declares its own size and can declare it wrongly,
   * which would leave the platform's 20 MB cap enforced solely by the
   * request-body validation a client is free to lie to. With the policy the
   * cap is enforced by S3 itself, on the bytes actually sent.
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
      // Returned to the client so the browser posts the declared type, and
      // turned into an exact-match policy condition by the same act, so a
      // client cannot substitute a different format than the one validated.
      Fields: { 'Content-Type': input.contentType },
      Conditions: [
        // The lower bound rejects an empty object: a zero-byte upload would
        // otherwise create a record that can never be transcribed.
        ['content-length-range', 1, input.maxSizeBytes],
        // Stated explicitly, and never as `starts-with`. The server chooses
        // this key from the authenticated user's `sub`, and
        // `StartFileTranscription` reads the owning user back out of it. A
        // prefix condition would hand key selection to the client, which
        // could then land an upload on another user's path.
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
 * so an unsanitised name is a header-injection vector on the download path in
 * exactly the way it already was on the upload path. The name is stripped, not
 * escaped: escaping puts the decision of what a client may express into the
 * hands of whoever next edits the escape table.
 */
function buildContentDisposition(downloadFileName: string): string {
  const sanitised = downloadFileName
    .replace(UNSAFE_DOWNLOAD_NAME_CHARACTERS, '')
    .trim()
    .slice(0, MAX_DOWNLOAD_FILE_NAME_LENGTH);

  return `attachment; filename="${sanitised === '' ? FALLBACK_DOWNLOAD_FILE_NAME : sanitised}"`;
}
