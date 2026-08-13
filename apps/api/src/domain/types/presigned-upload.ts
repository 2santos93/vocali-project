export interface PresignedUpload {
  readonly url: string;
  readonly fields: Record<string, string>;
  readonly expiresAt: Date;
}
