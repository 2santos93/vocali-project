import type { TranscriptionLanguage } from '@vocali/contracts/constants';

export interface SubmittedJob {
  readonly externalJobId: string;
}

export interface RealtimeCredentials {
  readonly token: string;
  readonly websocketUrl: string;
  readonly expiresAt: Date;
}

export interface ProviderCallback {
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly body: string | undefined;
}

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
