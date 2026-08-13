export type FileUploadPhase =
  | 'idle'
  | 'requesting'
  | 'uploading'
  | 'processing'
  /** Transcribed and stored. */
  | 'completed'
  /** The attempt ended badly; `failure` says how. */
  | 'failed'
  /**
   * Uploaded and accepted, but still being transcribed when the watch budget
   * ran out. Distinct from `failed` because nothing went wrong.
   */
  | 'stillProcessing';
