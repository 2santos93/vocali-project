import { FakeTranscriptionProvider } from './fake-transcription-provider.js';
import { FixedClock } from './fixed-clock.js';

const AT = new Date('2026-08-10T10:00:00.000Z');

function buildSubmission(): { audioUrl: string; language: string; callbackUrl: string } {
  return {
    audioUrl: 'https://storage.test/a.mp3',
    language: 'es',
    callbackUrl: 'https://api.test/callback',
  };
}

describe('FakeTranscriptionProvider', () => {
  it('assigns a distinct job id to each submission by default', async () => {
    const provider = new FakeTranscriptionProvider();

    const first = await provider.submitFileJob(buildSubmission());
    const second = await provider.submitFileJob(buildSubmission());

    expect(first.externalJobId).not.toBe(second.externalJobId);
  });

  it('lets a test pin a specific job id', async () => {
    const provider = new FakeTranscriptionProvider();
    provider.nextJobId = 'job-fixed';

    const submitted = await provider.submitFileJob(buildSubmission());

    expect(submitted.externalJobId).toBe('job-fixed');
  });

  it('derives credential expiry from the injected clock', async () => {
    const provider = new FakeTranscriptionProvider(new FixedClock(AT));

    const credentials = await provider.createRealtimeCredentials({ ttlSeconds: 30 });

    expect(credentials.expiresAt).toEqual(new Date('2026-08-10T10:00:30.000Z'));
  });

  it('rejects with the injected failure and clears it after one use', async () => {
    const provider = new FakeTranscriptionProvider();
    const failure = new Error('provider unavailable');
    provider.failNextWith = failure;

    await expect(provider.submitFileJob(buildSubmission())).rejects.toThrow(failure);

    await expect(provider.submitFileJob(buildSubmission())).resolves.toEqual({
      externalJobId: 'job-1',
    });
  });
});
