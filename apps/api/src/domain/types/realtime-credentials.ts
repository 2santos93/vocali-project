export interface RealtimeCredentials {
  readonly token: string;
  readonly websocketUrl: string;
  readonly expiresAt: Date;
}
