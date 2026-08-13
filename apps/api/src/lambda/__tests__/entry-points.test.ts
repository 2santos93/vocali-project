import { resetContainer } from '../../composition-root.js';
import { withoutCredentials } from '../../../test-support/without-credentials.js';

const ENVIRONMENT = {
  AWS_REGION: 'eu-west-1',
  AUDIO_BUCKET_NAME: 'vocali-audio-test',
  TRANSCRIPTS_BUCKET_NAME: 'vocali-transcripts-test',
  TRANSCRIPTIONS_TABLE_NAME: 'vocali-transcriptions-test',
  SPEECHMATICS_API_KEY_PARAMETER: '/vocali/test/speechmatics/api-key',
  SPEECHMATICS_WEBHOOK_SECRET_PARAMETER: '/vocali/test/speechmatics/webhook-secret',
  PROVIDER_CALLBACK_BASE_URL: 'https://api.test/webhooks/transcription-provider',
  WEBSOCKET_URL: 'wss://sockets.test/prod',
  WEBSOCKET_MANAGEMENT_ENDPOINT: 'https://sockets.test/prod',
};

/**
 * Bare names rather than specifiers, so this list is the same list Terraform
 * holds at `dist/<module>.handler` and can be read against it.
 */
const ENTRY_POINTS = [
  'create-upload-intent',
  'list-transcriptions',
  'get-transcription',
  'get-transcription-download-url',
  'save-realtime-transcription',
  'create-realtime-session',
  'start-transcription-job',
  'handle-provider-callback',
  'create-connection-ticket',
  'authorize-connection',
  'handle-connection-opened',
  'handle-connection-closed',
];

/**
 * A wiring check, not a behaviour check. These modules build the graph at
 * import time and hand a use case to a handler factory; handing over the wrong
 * one, or one the container never exposed, is a mistake nothing else in the
 * suite can see and that fails as a cold-start crash after a deploy.
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

  it.each(ENTRY_POINTS)('%s exports a handler built from the container', async (name) => {
    const module = (await import(`../${name}.js`)) as { handler?: unknown };

    expect(typeof module.handler).toBe('function');
  });
});
