export interface PresignedPostUpload {
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly file: File;
  readonly onProgress?: (percentage: number) => void;
}
