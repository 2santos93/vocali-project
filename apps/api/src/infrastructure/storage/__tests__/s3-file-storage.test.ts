import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts/constants';
import { mockClient } from 'aws-sdk-client-mock';
import { S3FileStorage } from '../s3-file-storage.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';

const BUCKET = 'vocali-audio-test';
const NOW = new Date('2026-08-10T12:00:00.000Z');
const AUDIO_KEY = 'audio/user-1/01A/visit.mp3';

const s3Mock = mockClient(S3Client);

interface PostPolicy {
  readonly expiration: string;
  readonly conditions: readonly unknown[];
}

function buildStorage(): S3FileStorage {
  // Credentials are supplied inline so nothing in the suite ever reaches for
  // an instance metadata endpoint or a shared credentials file.
  const client = new S3Client({
    region: 'eu-west-1',
    credentials: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret' },
  });

  return new S3FileStorage(client, BUCKET, new FixedClock(NOW));
}

function decodePolicy(fields: Record<string, string>): PostPolicy {
  const encoded = fields.Policy;
  if (encoded === undefined) throw new Error('the presigned post carried no policy');

  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as PostPolicy;
}

async function presignUpload(overrides: { contentType?: string } = {}): Promise<{
  fields: Record<string, string>;
  policy: PostPolicy;
  expiresAt: Date;
}> {
  const upload = await buildStorage().createPresignedUpload({
    objectKey: AUDIO_KEY,
    contentType: overrides.contentType ?? 'audio/mpeg',
    maxSizeBytes: MAX_AUDIO_FILE_SIZE_BYTES,
    expiresInSeconds: 900,
  });

  return {
    fields: upload.fields,
    policy: decodePolicy(upload.fields),
    expiresAt: upload.expiresAt,
  };
}

function dispositionOf(url: string): string {
  const disposition = new URL(url).searchParams.get('response-content-disposition');
  if (disposition === null) throw new Error('the download url carried no content disposition');

  return disposition;
}

describe('S3FileStorage', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('createPresignedUpload', () => {
    it('caps the upload at the maximum size with a content-length-range condition', async () => {
      const { policy } = await presignUpload();

      // The bound is asserted, not merely the presence of a url: this policy
      // condition is the only thing S3 enforces the size cap with, since a
      // client is free to misdeclare `sizeBytes` in the request body.
      expect(policy.conditions).toContainEqual([
        'content-length-range',
        1,
        MAX_AUDIO_FILE_SIZE_BYTES,
      ]);
    });

    it('pins the object key with an exact match and never with a prefix', async () => {
      const { policy } = await presignUpload();

      expect(policy.conditions).toContainEqual({ key: AUDIO_KEY });

      // A `starts-with` on the key would let the client choose where its
      // upload lands, and the pipeline derives the owning user from that path.
      const prefixConditions = policy.conditions.filter(
        (condition) => Array.isArray(condition) && condition[0] === 'starts-with',
      );
      expect(prefixConditions).toEqual([]);
    });

    it('binds the upload to the content type the client declared', async () => {
      const { fields, policy } = await presignUpload({ contentType: 'audio/flac' });

      expect(policy.conditions).toContainEqual({ 'Content-Type': 'audio/flac' });
      expect(fields['Content-Type']).toBe('audio/flac');
    });

    it('passes the requested lifetime through to the policy and reports it back', async () => {
      const requestedAt = Date.now();
      const { policy, expiresAt } = await presignUpload();

      // Written out rather than derived from the 900 above: the two must
      // agree, because a client that believes its link lasts fifteen minutes
      // while the policy expires sooner uploads into a rejection.
      expect(expiresAt.toISOString()).toBe('2026-08-10T12:15:00.000Z');

      // The signer stamps the policy from its own wall clock, which no port
      // injects, so that half is pinned as an interval instead. The lower
      // bound allows for the second precision the policy is written with.
      const policyLifetimeMs = Date.parse(policy.expiration) - requestedAt;
      expect(policyLifetimeMs).toBeGreaterThan(899_000);
      expect(policyLifetimeMs).toBeLessThan(901_000);
    });

    it('returns the fields a browser must post alongside the file', async () => {
      const { fields } = await presignUpload();

      expect(fields.key).toBe(AUDIO_KEY);
      expect(fields.bucket).toBe(BUCKET);
      expect(fields['X-Amz-Algorithm']).toBe('AWS4-HMAC-SHA256');
      expect(fields['X-Amz-Signature']).toEqual(expect.any(String));
    });
  });

  describe('createPresignedRead', () => {
    it('signs a plain object url for the configured lifetime', async () => {
      const url = await buildStorage().createPresignedRead({
        objectKey: AUDIO_KEY,
        expiresInSeconds: 3_600,
      });

      const parsed = new URL(url);
      expect(parsed.host).toBe(`${BUCKET}.s3.eu-west-1.amazonaws.com`);
      expect(parsed.pathname).toBe(`/${AUDIO_KEY}`);
      expect(parsed.searchParams.get('X-Amz-Expires')).toBe('3600');
      // The provider fetches the audio itself; forcing a download on that read
      // would serve no one and would leak the file name to the provider.
      expect(parsed.searchParams.get('response-content-disposition')).toBeNull();
    });
  });

  describe('createPresignedDownload', () => {
    it('forces an attachment carrying the requested file name', async () => {
      const url = await buildStorage().createPresignedDownload({
        objectKey: 'transcripts/user-1/01A.txt',
        downloadFileName: 'informe radiologia.txt',
        expiresInSeconds: 900,
      });

      expect(dispositionOf(url)).toBe('attachment; filename="informe radiologia.txt"');
      expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('900');
    });

    // S3 echoes this value back as a response header verbatim. Asserted on the
    // name between the delimiting quotes rather than on the whole header,
    // since an unsanitised name closes the quote early and still produces a
    // string that looks well formed.
    it.each([
      // A quote closes the filename; a CRLF begins a header of the client's choosing.
      ['a quote and a line break', 're"po\r\nX-Injected: yes\nrt.txt', 'repoX-Injected: yesrt.txt'],
      // A trailing backslash is a quoted-pair under RFC 9110, so `filename="a\"`
      // escapes its own closing quote and the header runs on into whatever follows.
      ['a trailing backslash', 'informe a\\', 'informe a'],
      // A separator turns the name into a path the browser may follow out of
      // the directory it was saving into.
      ['a path separator', '../x.txt', '..x.txt'],
    ])('strips %s so a file name cannot inject a header', async (_case, given, expected) => {
      const url = await buildStorage().createPresignedDownload({
        objectKey: 'transcripts/user-1/01A.txt',
        downloadFileName: given,
        expiresInSeconds: 900,
      });

      const fileName = /^attachment; filename="(.*)"$/s.exec(dispositionOf(url))?.[1];

      expect(fileName).toBe(expected);
      expect(fileName).not.toMatch(/["\r\n\\/]/);
    });

    it('truncates a name too long to belong in a header', async () => {
      const url = await buildStorage().createPresignedDownload({
        objectKey: 'transcripts/user-1/01A.txt',
        downloadFileName: `${'a'.repeat(300)}.txt`,
        expiresInSeconds: 900,
      });

      // Written out rather than derived from the constant the code uses: a
      // bound asserted against its own definition agrees with itself whatever
      // either becomes.
      const fileName = /^attachment; filename="(.*)"$/s.exec(dispositionOf(url))?.[1];

      expect(fileName).toBe('a'.repeat(200));
    });

    it('falls back to a fixed name when sanitisation leaves nothing', async () => {
      const url = await buildStorage().createPresignedDownload({
        objectKey: 'transcripts/user-1/01A.txt',
        downloadFileName: '\r\n ',
        expiresInSeconds: 900,
      });

      expect(dispositionOf(url)).toBe('attachment; filename="transcript"');
    });
  });

  describe('putText', () => {
    it('writes the body to the configured bucket with its content type', async () => {
      s3Mock.on(PutObjectCommand).resolves({});

      await buildStorage().putText({
        objectKey: 'transcripts/user-1/01A.json',
        body: '{"text":"the patient reports mild pain"}',
        contentType: 'application/json',
      });

      const calls = s3Mock.commandCalls(PutObjectCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.args[0].input).toEqual({
        Bucket: BUCKET,
        Key: 'transcripts/user-1/01A.json',
        Body: '{"text":"the patient reports mild pain"}',
        ContentType: 'application/json',
      });
    });

    it('propagates a storage failure instead of reporting a successful write', async () => {
      s3Mock.on(PutObjectCommand).rejects(new Error('AccessDenied'));

      await expect(
        buildStorage().putText({
          objectKey: 'transcripts/user-1/01A.json',
          body: '{}',
          contentType: 'application/json',
        }),
      ).rejects.toThrow('AccessDenied');
    });
  });
});
