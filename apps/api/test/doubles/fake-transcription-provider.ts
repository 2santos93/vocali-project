import type {
  RealtimeCredentials,
  SubmittedJob,
  TranscriptionProvider,
} from '../../src/domain/ports/transcription-provider.js';

export class FakeTranscriptionProvider implements TranscriptionProvider {
  readonly submissions: { audioUrl: string; language: string; callbackUrl: string }[] = [];
  nextJobId = 'job-1';

  submitFileJob(input: {
    audioUrl: string;
    language: string;
    callbackUrl: string;
  }): Promise<SubmittedJob> {
    this.submissions.push(input);
    return Promise.resolve({ externalJobId: this.nextJobId });
  }

  createRealtimeCredentials(input: { ttlSeconds: number }): Promise<RealtimeCredentials> {
    return Promise.resolve({
      token: 'temporary-token',
      websocketUrl: 'wss://provider.test/v2',
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1_000),
    });
  }
}
