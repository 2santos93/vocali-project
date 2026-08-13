import { InvalidEnvironmentError, loadConfig } from './environment.js';

const COMPLETE_ENVIRONMENT = {
  AWS_REGION: 'eu-west-1',
  AUDIO_BUCKET_NAME: 'vocali-audio',
  TRANSCRIPTS_BUCKET_NAME: 'vocali-transcripts',
  TRANSCRIPTIONS_TABLE_NAME: 'vocali-transcriptions',
  SPEECHMATICS_API_KEY_PARAMETER: '/vocali/speechmatics/api-key',
  SPEECHMATICS_WEBHOOK_SECRET_PARAMETER: '/vocali/speechmatics/webhook-secret',
  PROVIDER_CALLBACK_BASE_URL: 'https://api.vocali.test/webhooks/transcription-provider',
  WEBSOCKET_URL: 'wss://sockets.vocali.test/prod',
  WEBSOCKET_MANAGEMENT_ENDPOINT: 'https://sockets.vocali.test/prod',
};

function environmentWithout(...names: string[]): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(COMPLETE_ENVIRONMENT).filter(([name]) => !names.includes(name)),
  );
}

describe('loadConfig', () => {
  it('builds the configuration the composition root needs', () => {
    const config = loadConfig({
      ...COMPLETE_ENVIRONMENT,
      PROVIDER_REQUEST_TIMEOUT_MS: '4000',
      PROVIDER_MAX_ATTEMPTS: '5',
      LOG_LEVEL: 'debug',
    });

    expect(config).toEqual({
      region: 'eu-west-1',
      audioBucketName: 'vocali-audio',
      transcriptsBucketName: 'vocali-transcripts',
      transcriptionsTableName: 'vocali-transcriptions',
      providerCallbackBaseUrl: 'https://api.vocali.test/webhooks/transcription-provider',
      // Two endpoints for one API, and they are not interchangeable: the
      // browser dials `wss://`, the server posts to `https://`. Both are
      // asserted because deriving one from the other would put a scheme
      // rewrite between a completion and the browser waiting for it.
      websocketUrl: 'wss://sockets.vocali.test/prod',
      websocketManagementEndpoint: 'https://sockets.vocali.test/prod',
      logLevel: 'debug',
      speechmatics: {
        apiKeySecretName: '/vocali/speechmatics/api-key',
        webhookSecretName: '/vocali/speechmatics/webhook-secret',
        // Coerced from its string form: everything in an environment is a
        // string, and a timeout of "4000" would be compared against numbers.
        requestTimeoutMs: 4_000,
        maxAttempts: 5,
        retryBaseDelayMs: 250,
        maxRetryDelayMs: 10_000,
      },
    });
  });

  it('applies defaults for the variables a deployment need not set', () => {
    const config = loadConfig(COMPLETE_ENVIRONMENT);

    expect(config.logLevel).toBe('info');
    expect(config.speechmatics.requestTimeoutMs).toBe(10_000);
    expect(config.speechmatics.maxAttempts).toBe(3);
  });

  // Both buckets, because a deployment that sets only the audio one is the
  // configuration this system already shipped with: every transcript then goes
  // to whichever bucket the code happened to fall back to.
  it.each(['AUDIO_BUCKET_NAME', 'TRANSCRIPTS_BUCKET_NAME'])(
    'refuses to start when %s is missing',
    (name) => {
      expect(() => loadConfig(environmentWithout(name))).toThrow(InvalidEnvironmentError);
    },
  );

  it('names every offending variable rather than the first', () => {
    let thrown: unknown;
    try {
      loadConfig(environmentWithout('AWS_REGION', 'TRANSCRIPTIONS_TABLE_NAME'));
    } catch (caught) {
      thrown = caught;
    }

    // A misconfigured deployment usually misses several, and fixing them one
    // redeploy at a time is how an afternoon disappears.
    const message = (thrown as Error).message;
    expect(message).toContain('AWS_REGION');
    expect(message).toContain('TRANSCRIPTIONS_TABLE_NAME');
    expect((thrown as { code?: unknown }).code).toBe('INVALID_ENVIRONMENT');
  });

  it('rejects an empty variable as firmly as an absent one', () => {
    expect(() => loadConfig({ ...COMPLETE_ENVIRONMENT, AUDIO_BUCKET_NAME: '' })).toThrow(
      InvalidEnvironmentError,
    );
  });

  it('rejects a callback base that is not a url', () => {
    // The transcription's identity is appended to this as query parameters,
    // so a value `new URL()` cannot parse fails later, inside a job
    // submission, rather than here.
    expect(() =>
      loadConfig({ ...COMPLETE_ENVIRONMENT, PROVIDER_CALLBACK_BASE_URL: 'api.vocali.test' }),
    ).toThrow(InvalidEnvironmentError);
  });

  it.each([
    ['not-a-number', 'PROVIDER_REQUEST_TIMEOUT_MS'],
    ['0', 'PROVIDER_MAX_ATTEMPTS'],
    ['-1', 'PROVIDER_REQUEST_TIMEOUT_MS'],
    ['2.5', 'PROVIDER_MAX_ATTEMPTS'],
  ])('rejects %s as a value for %s', (value, name) => {
    expect(() => loadConfig({ ...COMPLETE_ENVIRONMENT, [name]: value })).toThrow(
      InvalidEnvironmentError,
    );
  });

  it('rejects a log level pino would not understand', () => {
    expect(() => loadConfig({ ...COMPLETE_ENVIRONMENT, LOG_LEVEL: 'verbose' })).toThrow(
      InvalidEnvironmentError,
    );
  });

  it('rejects a log level that would silence every line the system can write', () => {
    // `fatal` is a value pino understands perfectly well, which is why the
    // schema used to take it. Nothing this system emits is above `error`, so
    // setting it turns off all logging — including the lines recording that a
    // clinical transcription failed. Refused at boot, where it names the
    // variable, rather than at the first incident nobody can then diagnose.
    expect(() => loadConfig({ ...COMPLETE_ENVIRONMENT, LOG_LEVEL: 'fatal' })).toThrow(
      InvalidEnvironmentError,
    );
  });

  it('reports the variable that is wrong without repeating what was set', () => {
    let thrown: unknown;
    try {
      loadConfig({
        ...COMPLETE_ENVIRONMENT,
        PROVIDER_CALLBACK_BASE_URL: 'https://api.vocali.test/hook?token=Zx91QeRt44PLm',
        LOG_LEVEL: 'verbose',
      });
    } catch (caught) {
      thrown = caught;
    }

    // This message goes to a log. Environment values are set by whoever
    // deployed and are not this module's to disclose.
    const message = (thrown as Error).message;
    expect(message).toContain('LOG_LEVEL');
    expect(message).not.toContain('Zx91QeRt44PLm');
    expect(message).not.toContain('verbose');
  });
});
