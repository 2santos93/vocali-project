import { resetContainer } from '../composition-root.js';
import { withoutCredentials } from '../../test/without-credentials.js';

const ENVIRONMENT = {
  AWS_REGION: 'eu-west-1',
  AUDIO_BUCKET_NAME: 'vocali-audio-test',
  TRANSCRIPTS_BUCKET_NAME: 'vocali-transcripts-test',
  TRANSCRIPTIONS_TABLE_NAME: 'vocali-transcriptions-test',
  SPEECHMATICS_API_KEY_PARAMETER: '/vocali/test/speechmatics/api-key',
  SPEECHMATICS_WEBHOOK_SECRET_PARAMETER: '/vocali/test/speechmatics/webhook-secret',
  PROVIDER_CALLBACK_BASE_URL: 'https://api.test/webhooks/transcription-provider',
};

/**
 * Each of these is one Lambda function's entry point, and the name Terraform
 * points at: `dist/<module>.handler`.
 */
const ENTRY_POINTS = [
  './create-upload-intent.js',
  './list-transcriptions.js',
  './get-transcription.js',
  './get-transcription-download-url.js',
  './save-realtime-transcription.js',
  './create-realtime-session.js',
  './start-transcription-job.js',
  './handle-provider-callback.js',
];

/**
 * A wiring check, not a behaviour check — the behaviour of each handler is
 * pinned by its own suite. What these modules can get wrong is the wiring:
 * they build the dependency graph at import time and hand a use case to a
 * handler factory, and handing over the wrong one, or one the container never
 * exposed, is a mistake nothing else in the suite can see. It fails at
 * runtime as a cold-start crash on the first request after a deploy.
 *
 * Nothing here reaches the network: the AWS SDK clients resolve credentials
 * and open connections lazily, on their first command.
 */
describe('lambda entry points', () => {
  const originalEnvironment = process.env;

  beforeAll(() => {
    process.env = withoutCredentials({ ...originalEnvironment, ...ENVIRONMENT });
  });

  afterAll(() => {
    process.env = originalEnvironment;
    resetContainer();
  });

  it.each(ENTRY_POINTS)('%s exports a handler built from the container', async (specifier) => {
    const module = (await import(specifier)) as { handler?: unknown };

    expect(typeof module.handler).toBe('function');
  });
});
