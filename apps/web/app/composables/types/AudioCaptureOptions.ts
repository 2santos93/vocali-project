export interface AudioCaptureOptions {
  readonly sampleRate: number;
  /** Called once per rendered block, with the PCM the worklet produced. */
  readonly onFrame: (frame: ArrayBuffer) => void;
}
