import type {
  ProviderCallback,
  ProviderJobOutcome,
  RealtimeCredentials,
  SubmittedJob,
} from '../types/provider.js';

export interface TranscriptionProvider {
  /**
   * No language: an uploaded file is identified by the provider, not declared
   * by the caller, and only the adapter knows what its provider supports.
   */
  submitFileJob(input: { audioUrl: string; callbackUrl: string }): Promise<SubmittedJob>;
  createRealtimeCredentials(input: { ttlSeconds: number }): Promise<RealtimeCredentials>;
  interpretCallback(callback: ProviderCallback): Promise<ProviderJobOutcome>;
}
