export interface AudioCaptureDependencies {
  requestMicrophone(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createAudioContext(options: AudioContextOptions): AudioContext;
  createWorkletNode(context: AudioContext, name: string): AudioWorkletNode;
}
