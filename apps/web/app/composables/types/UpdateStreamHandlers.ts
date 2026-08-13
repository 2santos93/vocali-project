import type { Transcription } from '@vocali/contracts';

export interface UpdateStreamHandlers {
  /** One settled transcription, already validated against the shared contract. */
  onTranscription: (transcription: Transcription) => void;
  /**
   * The socket ended, for any reason. The caller's business is that pushes
   * have stopped arriving, not which of the reasons it was.
   */
  onClosed: () => void;
}
