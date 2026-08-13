export interface CreateAudioUploadIntentInput {
  readonly userId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}
