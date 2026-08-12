import {
  buildContainer,
  getContainer,
  resetContainer,
  type Container,
} from './composition-root.js';
import { loadConfig } from './infrastructure/config/environment.js';
import { withoutCredentials } from '../test/without-credentials.js';

const ENVIRONMENT = {
  AWS_REGION: 'eu-west-1',
  AUDIO_BUCKET_NAME: 'vocali-audio-test',
  TRANSCRIPTIONS_TABLE_NAME: 'vocali-transcriptions-test',
  SPEECHMATICS_API_KEY_PARAMETER: '/vocali/test/speechmatics/api-key',
  SPEECHMATICS_WEBHOOK_SECRET_PARAMETER: '/vocali/test/speechmatics/webhook-secret',
  PROVIDER_CALLBACK_BASE_URL: 'https://api.test/webhooks/transcription-provider',
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
] as const satisfies readonly (keyof Container)[];

describe('composition root', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = { ...originalEnvironment, ...ENVIRONMENT };
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
});
