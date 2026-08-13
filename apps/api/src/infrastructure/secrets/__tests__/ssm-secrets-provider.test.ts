import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { SsmSecretsProvider } from '../ssm-secrets-provider.js';

const API_KEY_PARAMETER = '/vocali/speechmatics/api-key';
const WEBHOOK_SECRET_PARAMETER = '/vocali/speechmatics/webhook-secret';

const SHARED_CACHE_PARAMETER = '/vocali/speechmatics/shared-cache-probe';

const ssmMock = mockClient(SSMClient);

function buildClient(): SSMClient {
  // Credentials are supplied inline so nothing in the suite ever reaches for
  // an instance metadata endpoint or a shared credentials file.
  return new SSMClient({
    region: 'eu-west-1',
    credentials: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret' },
  });
}

/** A cache of its own per provider, so nothing here leaks into the next test. */
function buildProvider(cache: Map<string, Promise<string>> = new Map()): SsmSecretsProvider {
  return new SsmSecretsProvider(buildClient(), cache);
}

describe('SsmSecretsProvider', () => {
  beforeEach(() => {
    ssmMock.reset();
  });

  it('reads the parameter and asks for it to be decrypted', async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'the-provider-key' } });

    const value = await buildProvider().getSecret(API_KEY_PARAMETER);

    expect(value).toBe('the-provider-key');
    const calls = ssmMock.commandCalls(GetParameterCommand);
    expect(calls).toHaveLength(1);
    // Without decryption the call still succeeds and returns the ciphertext,
    // which would then be sent to the provider as if it were the key.
    expect(calls[0]?.args[0].input).toEqual({ Name: API_KEY_PARAMETER, WithDecryption: true });
  });

  it('serves a second read from the cache', async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'the-provider-key' } });
    const provider = buildProvider();

    await provider.getSecret(API_KEY_PARAMETER);
    await provider.getSecret(API_KEY_PARAMETER);

    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(1);
  });

  it('keeps the cache across rebuilt dependency graphs, not just across calls', async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'the-provider-key' } });
    const client = buildClient();

    await new SsmSecretsProvider(client).getSecret(SHARED_CACHE_PARAMETER);
    await new SsmSecretsProvider(client).getSecret(SHARED_CACHE_PARAMETER);

    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(1);
  });

  it('collapses concurrent cold-start reads into one request', async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'the-provider-key' } });
    const provider = buildProvider();

    const [first, second] = await Promise.all([
      provider.getSecret(API_KEY_PARAMETER),
      provider.getSecret(API_KEY_PARAMETER),
    ]);

    expect([first, second]).toEqual(['the-provider-key', 'the-provider-key']);
    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(1);
  });

  it('caches each parameter separately', async () => {
    ssmMock
      .on(GetParameterCommand, { Name: API_KEY_PARAMETER })
      .resolves({ Parameter: { Value: 'the-provider-key' } })
      .on(GetParameterCommand, { Name: WEBHOOK_SECRET_PARAMETER })
      .resolves({ Parameter: { Value: 'the-webhook-secret' } });
    const provider = buildProvider();

    expect(await provider.getSecret(API_KEY_PARAMETER)).toBe('the-provider-key');
    expect(await provider.getSecret(WEBHOOK_SECRET_PARAMETER)).toBe('the-webhook-secret');
  });

  it.each([
    ['carries no value at all', undefined],
    ['exists but holds an empty string', ''],
  ])('reports a parameter that %s', async (_case, value) => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: value } });

    await expect(buildProvider().getSecret(API_KEY_PARAMETER)).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND',
    });
  });

  it('does not remember a failed read', async () => {
    ssmMock
      .on(GetParameterCommand)
      .rejectsOnce(new Error('ThrottlingException'))
      .resolves({ Parameter: { Value: 'the-provider-key' } });
    const provider = buildProvider();

    await expect(provider.getSecret(API_KEY_PARAMETER)).rejects.toThrow('ThrottlingException');

    // A cached rejection would turn one throttled read into a container that
    // can never fetch this secret again for the rest of its life.
    expect(await provider.getSecret(API_KEY_PARAMETER)).toBe('the-provider-key');
    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(2);
  });
});
