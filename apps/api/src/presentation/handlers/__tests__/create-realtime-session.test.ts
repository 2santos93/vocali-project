import { createRealtimeSessionHandler } from '../create-realtime-session.js';
import { CreateRealtimeSession } from '../../../application/use-cases/create-realtime-session.js';
import { TranscriptionProviderError } from '../../../domain/errors/domain-error.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
} from '../../../../test-support/builders/api-gateway-event.builder.js';
import { CapturingLogger } from '../../../../test-support/doubles/capturing-logger.js';
import { FakeTranscriptionProvider } from '../../../../test-support/doubles/fake-transcription-provider.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';

const NOW = new Date('2026-08-11T09:00:00.000Z');

function buildSubject(): {
  handler: ReturnType<typeof createRealtimeSessionHandler>;
  provider: FakeTranscriptionProvider;
} {
  const provider = new FakeTranscriptionProvider(new FixedClock(NOW));

  return {
    handler: createRealtimeSessionHandler({
      useCase: new CreateRealtimeSession(provider),
      logger: new CapturingLogger(),
    }),
    provider,
  };
}

describe('createRealtimeSessionHandler', () => {
  it('answers 200 with the credential, the socket url and the capture format', async () => {
    const { handler } = buildSubject();

    const response = await handler(buildApiGatewayEvent());

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response.body)).toEqual({
      token: 'temporary-token',
      websocketUrl: 'wss://provider.test/v2',
      expiresAt: '2026-08-11T09:01:00.000Z',
      audioFormat: { type: 'raw', encoding: 'pcm_s16le', sampleRate: 16_000 },
    });
  });

  /**
   * The credential spends the platform's metered provider quota, so an
   * unauthenticated route here is an open tap even though no record is read
   * or written. Nothing must reach the provider before the identity is known.
   */
  it('answers 401 without minting a credential when the request carries no identity', async () => {
    const { handler, provider } = buildSubject();
    provider.failNextWith = new Error('the provider must not have been called');

    const response = await handler(buildApiGatewayEvent({ authorizer: null }));

    expect(response.statusCode).toBe(401);
    expect(provider.failNextWith).toBeDefined();
  });

  it('answers a generic 500 when the provider refuses, without naming the provider', async () => {
    const { handler, provider } = buildSubject();
    provider.failNextWith = new TranscriptionProviderError('quota exhausted for this account');

    const response = await handler(buildApiGatewayEvent());

    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response.body).code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('quota');
  });
});
