import type { TranscriptionLanguage } from '@vocali/contracts/constants';

export interface SubmittedJob {
  readonly externalJobId: string;
}

export interface RealtimeCredentials {
  readonly token: string;
  readonly websocketUrl: string;
  readonly expiresAt: Date;
}

/**
 * A callback exactly as it arrived, with only the transport encoding removed.
 * Nothing here is interpreted: which parameter names a job and what the body
 * holds are the provider's decisions, so reading them belongs to its adapter.
 */
export interface ProviderCallback {
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly body: string | undefined;
}

/**
 * `unrecognised` is a third outcome rather than a thrown error: guessing one of
 * the other two is worse in both directions — a wrong `completed` stores
 * whatever the body held as a clinical transcript, and a wrong `failed` marks a
 * job dead that the provider may still be working on.
 */
export type ProviderJobOutcome =
  | {
      readonly kind: 'completed';
      readonly externalJobId: string;
      readonly text: string;
      readonly durationSeconds: number;
      /** Null where the provider recognised no language. Not a failure. */
      readonly language: TranscriptionLanguage | null;
    }
  | {
      readonly kind: 'failed';
      readonly externalJobId: string;
      /** For a log line only; what a clinician sees is written by the platform. */
      readonly providerStatus: string;
    }
  | { readonly kind: 'unrecognised'; readonly reason: string };
