import { CreateRealtimeSession } from '../create-realtime-session.js';
import { FakeTranscriptionProvider } from '../../../../test-support/doubles/fake-transcription-provider.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';

const NOW = new Date('2026-08-10T10:00:00.000Z');

describe('CreateRealtimeSession', () => {
  it('returns a token and websocket url with a 60-second expiry and the fixed audio format', async () => {
    const provider = new FakeTranscriptionProvider(new FixedClock(NOW));
    const useCase = new CreateRealtimeSession(provider);

    const result = await useCase.execute();

    expect(result.token).toBe('temporary-token');
    expect(result.websocketUrl).toBe('wss://provider.test/v2');
    // Pins the ttlSeconds argument indirectly: the fake derives expiresAt as
    // `clock.now() + ttlSeconds * 1000`, so an exact match here only holds
    // if the use case requested exactly 60 seconds.
    expect(result.expiresAt).toBe(new Date(NOW.getTime() + 60_000).toISOString());
    expect(result.audioFormat).toEqual({
      type: 'raw',
      encoding: 'pcm_s16le',
      sampleRate: 16_000,
    });
  });

  it('propagates a provider failure', async () => {
    const provider = new FakeTranscriptionProvider();
    provider.failNextWith = new Error('provider unavailable');
    const useCase = new CreateRealtimeSession(provider);

    await expect(useCase.execute()).rejects.toThrow('provider unavailable');
  });
});
