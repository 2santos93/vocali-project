import type { Clock } from '../../src/domain/ports/clock.js';
import type {
  RealtimeCredentials,
  SubmittedJob,
  TranscriptionProvider,
} from '../../src/domain/ports/transcription-provider.js';

type SubmitFileJobInput = Parameters<TranscriptionProvider['submitFileJob']>[0];
type CreateRealtimeCredentialsInput = Parameters<
  TranscriptionProvider['createRealtimeCredentials']
>[0];

export class FakeTranscriptionProvider implements TranscriptionProvider {
  readonly submissions: SubmitFileJobInput[] = [];

  /** Overrides every generated job id until reset to `undefined`. */
  nextJobId?: string | undefined;

  /** Set to make the next call reject with this error; cleared after one use. */
  failNextWith?: Error | undefined;

  private jobSequence = 0;

  constructor(private readonly clock: Clock = { now: (): Date => new Date() }) {}

  submitFileJob(input: SubmitFileJobInput): Promise<SubmittedJob> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.submissions.push(input);
    this.jobSequence += 1;
    const externalJobId = this.nextJobId ?? `job-${String(this.jobSequence)}`;
    return Promise.resolve({ externalJobId });
  }

  createRealtimeCredentials(input: CreateRealtimeCredentialsInput): Promise<RealtimeCredentials> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    return Promise.resolve({
      token: 'temporary-token',
      websocketUrl: 'wss://provider.test/v2',
      expiresAt: new Date(this.clock.now().getTime() + input.ttlSeconds * 1_000),
    });
  }

  private consumeFailure(): Error | undefined {
    const failure = this.failNextWith;
    this.failNextWith = undefined;
    return failure;
  }
}
