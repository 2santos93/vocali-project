import type { ProviderCallback } from '../types/provider-callback.js';
import type { ProviderJobOutcome } from '../types/provider-job-outcome.js';
import type { RealtimeCredentials } from '../types/realtime-credentials.js';
import type { SubmittedJob } from '../types/submitted-job.js';

export interface TranscriptionProvider {
  /**
   * No language: an uploaded file is identified by the provider, not declared
   * by the caller, and only the adapter knows what its provider supports.
   */
  submitFileJob(input: { audioUrl: string; callbackUrl: string }): Promise<SubmittedJob>;
  createRealtimeCredentials(input: { ttlSeconds: number }): Promise<RealtimeCredentials>;
  /**
   * Asynchronous even though a provider may need no I/O to answer: some post
   * the transcript in the callback body, others post only a job id and leave
   * the transcript to be fetched. A synchronous port serves only the first.
   */
  interpretCallback(callback: ProviderCallback): Promise<ProviderJobOutcome>;
}
