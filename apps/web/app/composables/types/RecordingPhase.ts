export type RecordingPhase =
  | 'idle'
  /** Minting the provider session. */
  | 'preparing'
  /** Socket open, waiting for the provider to acknowledge `StartRecognition`. */
  | 'connecting'
  | 'recording'
  /** `EndOfStream` sent, waiting for the last words. */
  | 'finishing'
  | 'saving'
  | 'saved'
  | 'failed';
