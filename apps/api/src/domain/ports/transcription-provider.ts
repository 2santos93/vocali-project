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
 * A callback the provider posted, exactly as it arrived: the query string of
 * the URL it was given, plus whatever it appended to that URL, and the body
 * with any transport encoding already removed.
 *
 * Nothing here is interpreted. Which parameter names a job, which one reports
 * a status and what the body contains are all the provider's decisions, so
 * reading them belongs to the adapter that speaks for it.
 */
export interface ProviderCallback {
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly body: string | undefined;
}

/**
 * What a callback meant, said in this platform's own terms.
 *
 * `unrecognised` is a third outcome rather than a thrown error because it is
 * an expected one: a callback can arrive malformed, and the caller needs to
 * answer it rather than fail. Guessing either of the other two instead would
 * be worse in both directions — a wrong `completed` stores whatever the body
 * happened to hold as a clinical transcript, and a wrong `failed` marks a job
 * dead that the provider may still be working on.
 *
 * `externalJobId` is the provider's own identifier for the job, which the
 * caller checks against the one it recorded at submission. Every adapter owes
 * a non-empty, bounded string here: it reaches storage and the log.
 */
export type ProviderJobOutcome =
  | {
      readonly kind: 'completed';
      readonly externalJobId: string;
      readonly text: string;
      readonly durationSeconds: number;
      /**
       * The language the provider identified in the audio, or null where it
       * reported none this platform recognises. Null is an ordinary outcome
       * rather than a failure: a job can be too short to identify, and the
       * transcript is still a transcript.
       */
      readonly language: TranscriptionLanguage | null;
    }
  | {
      readonly kind: 'failed';
      readonly externalJobId: string;
      /**
       * The provider's own word for what went wrong. Operational detail for a
       * log line and nothing more — what a clinician is shown is written by
       * the platform, not borrowed from a third party's vocabulary.
       */
      readonly providerStatus: string;
    }
  | { readonly kind: 'unrecognised'; readonly reason: string };

export interface TranscriptionProvider {
  /**
   * No language: an uploaded file is identified by the provider, not declared
   * by the caller. Which languages it may be identified as is the adapter's
   * business, because it is the adapter that knows what its provider supports.
   */
  submitFileJob(input: { audioUrl: string; callbackUrl: string }): Promise<SubmittedJob>;
  createRealtimeCredentials(input: { ttlSeconds: number }): Promise<RealtimeCredentials>;
  /**
   * Translates a job outcome the provider pushed back to us.
   *
   * This sits beside the two calls above because it is the same boundary read
   * in the other direction, and because it is the half a swap of providers
   * would otherwise leave behind: without it the webhook handler has to know
   * one vendor's payload shape, and changing provider means editing the route
   * that also carries the shared-secret check and the redelivery rules.
   *
   * Asynchronous even though a provider may need no I/O to answer. Some post
   * the transcript in the callback body and some post only a job id and a
   * status, leaving the transcript to be fetched — a port that could not
   * express the second kind would be a port for one provider.
   */
  interpretCallback(callback: ProviderCallback): Promise<ProviderJobOutcome>;
}
