export interface AudioCaptureOptions {
  readonly sampleRate: number;
  /** Called once per rendered block, with the PCM the worklet produced. */
  readonly onFrame: (frame: ArrayBuffer) => void;
}

/**
 * The recorder holds the capture behind this interface, which is what lets a
 * test drive a dictation with no hardware and no `AudioContext` at all.
 */
export interface AudioCapture {
  start(options: AudioCaptureOptions): Promise<void>;
  stop(): Promise<void>;
}

export interface AudioCaptureDependencies {
  requestMicrophone(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createAudioContext(options: AudioContextOptions): AudioContext;
  createWorkletNode(context: AudioContext, name: string): AudioWorkletNode;
}
