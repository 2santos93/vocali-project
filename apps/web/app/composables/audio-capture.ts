import type { TranslatableMessage } from '../i18n/types/TranslatableMessage';
import type { AudioCapture } from './types/AudioCapture';
import type { AudioCaptureDependencies } from './types/AudioCaptureDependencies';
import type { AudioCaptureOptions } from './types/AudioCaptureOptions';
import type { MicrophoneFailureCode } from './types/MicrophoneFailureCode';

/** `public/` is served at the site root. */
export const PCM_ENCODER_WORKLET_URL = '/worklets/pcm-encoder.js';

/** Must match the name `registerProcessor` is called with inside the worklet. */
export const PCM_ENCODER_PROCESSOR_NAME = 'pcm-encoder';

export class MicrophoneError extends Error {
  public readonly code: MicrophoneFailureCode;

  /** The sentence is produced from this at the moment it reaches the screen. */
  public readonly detail: TranslatableMessage;

  constructor(code: MicrophoneFailureCode, detail: TranslatableMessage) {
    super(detail.key);
    this.name = 'MicrophoneError';
    this.code = code;
    this.detail = detail;
  }
}

function nameOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const candidate: unknown = (error as { name?: unknown }).name;
  return typeof candidate === 'string' ? candidate : null;
}

/**
 * The distinction that matters is "you said no" versus "there is nothing to
 * say yes with": the first is fixed in the address bar, the second by plugging
 * something in. One message for both sends the user to the wrong place.
 */
function toMicrophoneError(error: unknown): MicrophoneError {
  const name = nameOf(error);

  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return new MicrophoneError('PERMISSION_DENIED', { key: 'failure.microphone.denied' });
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  ) {
    return new MicrophoneError('NO_MICROPHONE', { key: 'failure.microphone.missing' });
  }
  return new MicrophoneError('CAPTURE_FAILED', { key: 'failure.microphone.busy' });
}

/**
 * An `AudioWorklet` rather than `ScriptProcessorNode`, which runs on the main
 * thread and drops samples exactly when the page is busy rendering the
 * transcript growing beneath it.
 *
 * The `AudioContext` is constructed at the provider's sample rate rather than
 * resampled afterwards: resampling in JavaScript costs quality and main-thread
 * time for something the browser does properly if simply asked.
 */
export function createWorkletAudioCapture(
  dependencies: AudioCaptureDependencies = {
    requestMicrophone: (constraints: MediaStreamConstraints): Promise<MediaStream> =>
      navigator.mediaDevices.getUserMedia(constraints),
    createAudioContext: (options: AudioContextOptions): AudioContext => new AudioContext(options),
    createWorkletNode: (context: AudioContext, name: string): AudioWorkletNode =>
      new AudioWorkletNode(context, name),
  },
): AudioCapture {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;

  async function stop(): Promise<void> {
    node?.disconnect();
    node = null;

    // Stopping every track is what turns the browser's recording indicator
    // off; closing the context alone leaves the tab showing as listening.
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    stream = null;

    const closing = context;
    context = null;
    await closing?.close();
  }

  async function start(options: AudioCaptureOptions): Promise<void> {
    try {
      stream = await dependencies.requestMicrophone({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error: unknown) {
      throw toMicrophoneError(error);
    }

    try {
      context = dependencies.createAudioContext({ sampleRate: options.sampleRate });
      await context.audioWorklet.addModule(PCM_ENCODER_WORKLET_URL);

      node = dependencies.createWorkletNode(context, PCM_ENCODER_PROCESSOR_NAME);
      node.port.onmessage = (event: MessageEvent<ArrayBuffer>): void => {
        options.onFrame(event.data);
      };

      context.createMediaStreamSource(stream).connect(node);

      /*
       * Keeps the graph rendering: a node with no path to the output is not
       * guaranteed to be pulled, and the symptom is a worklet whose `process`
       * is never called. No feedback — the worklet emits silence.
       */
      node.connect(context.destination);
    } catch (error: unknown) {
      await stop();
      throw error instanceof MicrophoneError
        ? error
        : new MicrophoneError('CAPTURE_FAILED', { key: 'failure.microphone.unsupportedBrowser' });
    }
  }

  return { start, stop };
}
