import type {
  RealtimeSessionResponse,
  SaveRealtimeTranscriptionRequest,
  Transcription,
} from '@vocali/contracts';
import type { AudioCapture } from './AudioCapture';

export interface AudioRecorderDependencies {
  /** Mints the short-lived provider credential. */
  createSession(): Promise<RealtimeSessionResponse>;
  /** Stores the finished dictation. */
  saveTranscription(request: SaveRealtimeTranscriptionRequest): Promise<Transcription>;
  capture: AudioCapture;
  createSocket(url: string): WebSocket;
  now(): number;
  wait(milliseconds: number): Promise<void>;
}
