import { GetParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import type { SecretsProvider } from '../../domain/ports/secrets-provider.js';

/**
 * Deliberately at module scope rather than on the instance.
 *
 * A Lambda container survives many invocations, and the module is evaluated
 * once for all of them. Holding the cache here means a warm container reads
 * each parameter exactly once no matter how the dependency graph is rebuilt,
 * where an instance field would still re-fetch whenever something constructed
 * a new provider. Parameter Store is rate limited and every read is a network
 * round trip on the request path.
 *
 * The promise is cached, not the resolved value, so two concurrent callers
 * during a cold start share one request instead of racing to make two.
 */
const secretCache = new Map<string, Promise<string>>();

/** Test seam: module state outlives a test file otherwise, as it is meant to. */
export function clearSecretCache(): void {
  secretCache.clear();
}

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
  constructor(private readonly client: SSMClient) {}

  getSecret(name: string): Promise<string> {
    const cached = secretCache.get(name);
    if (cached !== undefined) return cached;

    const pending = this.read(name).catch((cause: unknown) => {
      // A failure must not be remembered. Caching a rejected promise would
      // turn one transient Parameter Store error into a container that can
      // never fetch that secret again for the rest of its life.
      secretCache.delete(name);
      throw cause;
    });

    secretCache.set(name, pending);

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
