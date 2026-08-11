export interface SubmittedJob {
  readonly externalJobId: string;
}

export interface RealtimeCredentials {
  readonly token: string;
  readonly websocketUrl: string;
  readonly expiresAt: Date;
}

export interface TranscriptionProvider {
  submitFileJob(input: {
    audioUrl: string;
    language: string;
    callbackUrl: string;
  }): Promise<SubmittedJob>;
  createRealtimeCredentials(input: { ttlSeconds: number }): Promise<RealtimeCredentials>;
}
