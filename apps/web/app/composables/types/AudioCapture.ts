import type { AudioCaptureOptions } from './AudioCaptureOptions';

/**
 * The recorder holds the capture behind this interface, which is what lets a
 * test drive a dictation with no hardware and no `AudioContext` at all.
 */
export interface AudioCapture {
  start(options: AudioCaptureOptions): Promise<void>;
  stop(): Promise<void>;
}
