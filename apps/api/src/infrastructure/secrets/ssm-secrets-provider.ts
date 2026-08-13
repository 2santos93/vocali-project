import { GetParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import type { SecretsProvider } from '../../domain/ports/secrets-provider.js';

/**
 * At module scope rather than on the instance, so a warm container reads each
 * rate-limited parameter once however often the dependency graph is rebuilt.
 * The promise is cached, not the resolved value, so two concurrent callers
 * during a cold start share one request instead of racing to make two.
 */
const sharedSecretCache = new Map<string, Promise<string>>();

export class MissingSecretError extends Error {
  readonly code = 'SECRET_NOT_FOUND';

  constructor(name: string) {
    // The parameter name is a configured path, not a secret, and naming it is
    // the difference between a five-minute fix and an afternoon of guessing.
    super(`Secret "${name}" has no value in Parameter Store`);
    this.name = 'MissingSecretError';
  }
}

export class SsmSecretsProvider implements SecretsProvider {
  /**
   * The cache is a collaborator defaulting to the shared map, so a test builds
   * a provider over a map of its own instead of production exporting a
   * function whose only purpose is to empty it.
   */
  constructor(
    private readonly client: SSMClient,
    private readonly cache: Map<string, Promise<string>> = sharedSecretCache,
  ) {}

  getSecret(name: string): Promise<string> {
    const cached = this.cache.get(name);
    if (cached !== undefined) return cached;

    const pending = this.read(name).catch((cause: unknown) => {
      // Caching a rejected promise would turn one transient Parameter Store
      // error into a container that can never fetch that secret again.
      this.cache.delete(name);
      throw cause;
    });

    this.cache.set(name, pending);

    return pending;
  }

  private async read(name: string): Promise<string> {
    const response = await this.client.send(
      // `WithDecryption` because these are SecureString parameters; without
      // it the call succeeds and returns the ciphertext, which then travels
      // onwards as if it were the key.
      new GetParameterCommand({ Name: name, WithDecryption: true }),
    );

    const value = response.Parameter?.Value;
    if (value === undefined || value === '') throw new MissingSecretError(name);

    return value;
  }
}
