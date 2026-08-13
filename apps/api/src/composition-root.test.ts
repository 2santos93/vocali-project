import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import {
  buildContainer,
  getContainer,
  resetContainer,
  type Container,
} from './composition-root.js';
import { toTranscriptionItem } from './infrastructure/persistence/transcription.mapper.js';
import { loadConfig } from './infrastructure/config/environment.js';
import { buildTranscription } from '../test/builders/transcription.builder.js';
import { withoutCredentials } from '../test/without-credentials.js';

const AUDIO_BUCKET = 'vocali-audio-test';
const TRANSCRIPTS_BUCKET = 'vocali-transcripts-test';

const ENVIRONMENT = {
  AWS_REGION: 'eu-west-1',
  AUDIO_BUCKET_NAME: AUDIO_BUCKET,
  TRANSCRIPTS_BUCKET_NAME: TRANSCRIPTS_BUCKET,
  TRANSCRIPTIONS_TABLE_NAME: 'vocali-transcriptions-test',
  SPEECHMATICS_API_KEY_PARAMETER: '/vocali/test/speechmatics/api-key',
  SPEECHMATICS_WEBHOOK_SECRET_PARAMETER: '/vocali/test/speechmatics/webhook-secret',
  PROVIDER_CALLBACK_BASE_URL: 'https://api.test/webhooks/transcription-provider',
  WEBSOCKET_URL: 'wss://sockets.test/prod',
  WEBSOCKET_MANAGEMENT_ENDPOINT: 'https://sockets.test/prod',
};

/**
 * Credentials the SDK can find without leaving the process, needed because the
 * bucket tests below presign, and presigning signs with real credentials.
 * `withoutCredentials` strips these again for the test that asserts the graph
 * builds without touching AWS.
 */
const CREDENTIALS = {
  AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
  AWS_SECRET_ACCESS_KEY: 'secret',
};

const USE_CASE_KEYS = [
  'createAudioUploadIntent',
  'listUserTranscriptions',
  'getTranscription',
  'getTranscriptionDownloadUrl',
  'saveRealtimeTranscription',
  'createRealtimeSession',
  'startFileTranscription',
  'completeTranscription',
  'failTranscription',
  'issueConnectionTicket',
  'redeemConnectionTicket',
  'registerConnection',
  'deregisterConnection',
  'publishTranscriptionUpdate',
] as const satisfies readonly (keyof Container)[];

const s3Mock = mockClient(S3Client);
const dynamoMock = mockClient(DynamoDBDocumentClient);
const ssmMock = mockClient(SSMClient);

describe('composition root', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = { ...originalEnvironment, ...ENVIRONMENT, ...CREDENTIALS };
    resetContainer();
  });

  afterEach(() => {
    process.env = originalEnvironment;
    resetContainer();
  });

  it('builds every use case a handler can ask for', () => {
    const container = buildContainer(loadConfig(ENVIRONMENT));

    for (const key of USE_CASE_KEYS) {
      expect(container[key]).toBeDefined();
    }
  });

  /**
   * The property warm invocations depend on. A graph rebuilt per request would
   * create three AWS SDK clients per call and discard the secret cache, so
   * every request would go back to Parameter Store. Identity is the only
   * assertion that can see the difference — a rebuilt graph is still a valid
   * graph, and every other check would pass.
   */
  it('builds the graph once and reuses it across invocations', () => {
    const first = getContainer();
    const second = getContainer();

    expect(second).toBe(first);
    expect(second.createAudioUploadIntent).toBe(first.createAudioUploadIntent);
  });

  it('reads the configuration through the same loader the container uses', () => {
    expect(getContainer().config.audioBucketName).toBe('vocali-audio-test');
    expect(getContainer().config.transcriptionsTableName).toBe('vocali-transcriptions-test');
    expect(getContainer().config.speechmatics.webhookSecretName).toBe(
      '/vocali/test/speechmatics/webhook-secret',
    );
  });

  /**
   * The failure has to happen here, while the container initialises, rather
   * than on the first request. Lambda reports an init failure on every
   * invocation with the reason attached; a lazy failure reports it once, as a
   * 500 on a user's upload, long after the deploy that caused it.
   */
  it('refuses to build a graph from an environment missing a required variable', () => {
    delete process.env.AUDIO_BUCKET_NAME;

    expect(() => getContainer()).toThrow(/AUDIO_BUCKET_NAME/);
  });

  /**
   * Configuration validation must be the *only* thing that can fail while the
   * graph is being built. Anything else that throws at module scope surfaces
   * as an initialisation crash with no request, no correlation id and no
   * handler context attached to it — a far worse thing to diagnose than the
   * named-variable failure above, which is deliberate.
   *
   * See `withoutCredentials` for why the credential variables are stripped.
   */
  it('builds with no credentials in the environment, so only the configuration can fail', () => {
    process.env = withoutCredentials(process.env);

    expect(() => getContainer()).not.toThrow();
    expect(getContainer().createAudioUploadIntent).toBeDefined();
  });

  /**
   * Which bucket a use case reaches is decided here and is invisible anywhere
   * else: `FileStorage` carries an object key and no bucket, so every use case
   * behaves identically whichever store it was handed, and every in-memory
   * double answers identically too. Only the deployed roles tell the
   * difference — `s3:PutObject` is granted on the transcripts bucket alone, so
   * a transcript writer holding the audio adapter is denied at the moment of
   * the write, after the provider has transcribed the audio and billed for it.
   *
   * So these run the real adapters against a mocked S3 and assert the bucket
   * on the wire, which is the only place the mistake is observable.
   */
  describe('bucket routing', () => {
    const USER_ID = 'user-1';
    const TRANSCRIPTION_ID = '01A';
    const AUDIO_OBJECT_KEY = `audio/${USER_ID}/${TRANSCRIPTION_ID}/visit.mp3`;
    const originalFetch = globalThis.fetch;

    let submittedJobConfig: string | undefined;

    beforeEach(() => {
      s3Mock.reset();
      dynamoMock.reset();
      ssmMock.reset();
      s3Mock.on(PutObjectCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});
      ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'provider-key' } });

      // The provider adapter reaches for the global `fetch` when the
      // composition root builds it — its injectable hook is a test seam
      // production does not use, so intercepting here is what keeps the
      // wiring under test the wiring that ships.
      submittedJobConfig = undefined;
      globalThis.fetch = captureJobSubmission((config) => {
        submittedJobConfig = config;
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    function storeRecord(transcription: ReturnType<typeof buildTranscription>): void {
      dynamoMock
        .on(GetCommand)
        .resolves({ Item: toTranscriptionItem(transcription.toPrimitives()) });
    }

    function writtenBuckets(): (string | undefined)[] {
      return s3Mock.commandCalls(PutObjectCommand).map((call) => call.args[0].input.Bucket);
    }

    /** Virtual-hosted style, so the bucket is the first label of the host. */
    function signedBucketOf(url: string): string {
      const [bucket] = new URL(url).hostname.split('.');
      return bucket ?? '';
    }

    it('writes a completed provider transcript to the transcripts bucket', async () => {
      storeRecord(buildTranscription({ id: TRANSCRIPTION_ID, userId: USER_ID }));
      const container = buildContainer(loadConfig(process.env));

      const result = await container.completeTranscription.execute({
        userId: USER_ID,
        transcriptionId: TRANSCRIPTION_ID,
        externalJobId: 'job-1',
        text: 'the patient reports mild pain',
        durationSeconds: 12,
        language: null,
      });

      expect(result.success).toBe(true);
      // Both formats, and neither of them in the bucket holding the audio.
      expect(writtenBuckets()).toEqual([TRANSCRIPTS_BUCKET, TRANSCRIPTS_BUCKET]);
    });

    it('writes a realtime transcript to the transcripts bucket', async () => {
      const container = buildContainer(loadConfig(process.env));

      await container.saveRealtimeTranscription.execute({
        userId: USER_ID,
        text: 'the patient reports mild pain',
        durationSeconds: 12,
        language: 'es',
      });

      expect(writtenBuckets()).toEqual([TRANSCRIPTS_BUCKET, TRANSCRIPTS_BUCKET]);
    });

    it('signs a transcript download against the transcripts bucket', async () => {
      storeRecord(completedTranscription());
      const container = buildContainer(loadConfig(process.env));

      const result = await container.getTranscriptionDownloadUrl.execute({
        userId: USER_ID,
        transcriptionId: TRANSCRIPTION_ID,
        format: 'txt',
      });

      if (!result.success) throw new Error('the download url could not be signed');
      expect(signedBucketOf(result.value.url)).toBe(TRANSCRIPTS_BUCKET);
    });

    it('signs an audio upload against the audio bucket', async () => {
      const container = buildContainer(loadConfig(process.env));

      const result = await container.createAudioUploadIntent.execute({
        userId: USER_ID,
        fileName: 'visit.mp3',
        contentType: 'audio/mpeg',
        sizeBytes: 2_048,
      });

      if (!result.success) throw new Error('the upload could not be signed');
      expect(signedBucketOf(result.value.upload.url)).toBe(AUDIO_BUCKET);
    });

    it('signs the provider read against the audio bucket', async () => {
      storeRecord(buildTranscription({ id: TRANSCRIPTION_ID, userId: USER_ID }));
      const container = buildContainer(loadConfig(process.env));

      const result = await container.startFileTranscription.execute({
        audioObjectKey: AUDIO_OBJECT_KEY,
      });

      expect(result.success).toBe(true);
      // The provider downloads the audio from this URL itself. Signed against
      // the wrong bucket it is a 403 the provider reports, minutes later, as a
      // job that could not fetch its data.
      expect(signedBucketOf(submittedAudioUrl(submittedJobConfig))).toBe(AUDIO_BUCKET);
    });
  });
});

function completedTranscription(): ReturnType<typeof buildTranscription> {
  const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
  const processing = transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
  if (!processing.success) throw new Error('fixture must be able to start processing');

  const completed = transcription.markAsCompleted({
    transcriptObjectKey: 'transcripts/user-1/01A.txt',
    text: 'the patient reports mild pain',
    durationSeconds: 12,
    at: new Date('2026-08-10T10:02:00.000Z'),
    language: null,
  });
  if (!completed.success) throw new Error('fixture must be able to complete');

  return transcription;
}

/**
 * Answers a job submission with an accepted job and hands its `config` part to
 * the caller. Nothing here leaves the process: an unrecognised request is
 * refused rather than passed through, so a test that starts making real calls
 * fails instead of reaching Speechmatics.
 */
function captureJobSubmission(onSubmission: (config: string) => void): typeof fetch {
  return (_input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const body = init?.body;
    if (!(body instanceof FormData)) {
      return Promise.reject(new Error('only a multipart job submission is answered here'));
    }

    const config = body.get('config');
    if (typeof config === 'string') onSubmission(config);

    return Promise.resolve(
      new Response(JSON.stringify({ id: 'job-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
}

function submittedAudioUrl(config: string | undefined): string {
  if (config === undefined) throw new Error('no job submission was intercepted');

  const parsed = JSON.parse(config) as { fetch_data: { url: string } };
  return parsed.fetch_data.url;
}
