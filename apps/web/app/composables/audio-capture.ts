import type { TranslatableMessage } from '../i18n/translate';

/**
 * Getting audio out of a microphone and into the caller's hands as PCM.
 *
 * Separate from the dictation flow because it is the one part of that flow
 * that talks to the device rather than to the provider: it knows about
 * permissions, tracks, worklets and the browser's recording indicator, and
 * nothing about sessions, sockets or transcripts. The recorder holds it behind
 * the `AudioCapture` interface below, which is what lets a test drive a
 * dictation with no hardware and no `AudioContext` at all.
 */

/** The URL the browser fetches the worklet module from. `public/` is served at the site root. */
export const PCM_ENCODER_WORKLET_URL = '/worklets/pcm-encoder.js';

/** Must match the name `registerProcessor` is called with inside the worklet. */
export const PCM_ENCODER_PROCESSOR_NAME = 'pcm-encoder';

export type MicrophoneFailureCode = 'PERMISSION_DENIED' | 'NO_MICROPHONE' | 'CAPTURE_FAILED';

export class MicrophoneError extends Error {
  public readonly code: MicrophoneFailureCode;

  /**
   * What the reader is told. `Error.message` has to be a string and is what a
   * developer meets in a stack trace, so it carries the key; the sentence is
   * produced from `detail` at the moment it reaches the screen.
   */
  public readonly detail: TranslatableMessage;

  constructor(code: MicrophoneFailureCode, detail: TranslatableMessage) {
    super(detail.key);
    this.name = 'MicrophoneError';
    this.code = code;
    this.detail = detail;
  }
}

export interface AudioCaptureOptions {
  readonly sampleRate: number;
  /** Called once per rendered block, with the PCM the worklet produced. */
  readonly onFrame: (frame: ArrayBuffer) => void;
}

export interface AudioCapture {
  start(options: AudioCaptureOptions): Promise<void>;
  stop(): Promise<void>;
}

export interface AudioCaptureDependencies {
  requestMicrophone(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createAudioContext(options: AudioContextOptions): AudioContext;
  createWorkletNode(context: AudioContext, name: string): AudioWorkletNode;
}

function nameOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const candidate: unknown = (error as { name?: unknown }).name;
  return typeof candidate === 'string' ? candidate : null;
}

/**
 * Translates what `getUserMedia` rejects with into something a clinician can
 * act on.
 *
 * The distinction that matters is "you said no" versus "there is nothing to
 * say yes with": the first is fixed in the browser's address bar, the second
 * by plugging something in. A single "no se pudo acceder al micrófono" sends
 * the user looking in the wrong place.
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
 * Microphone capture through an `AudioWorklet`.
 *
 * `ScriptProcessorNode` is deprecated and runs on the main thread, so it drops
 * samples exactly when the page is busy rendering the transcript that is
 * growing beneath it. The worklet runs on the audio thread instead.
 *
 * The `AudioContext` is constructed at the provider's sample rate rather than
 * resampled afterwards. Resampling in JavaScript costs quality and main-thread
 * time for something the audio hardware and the browser will do properly if
 * simply asked; asking is one option object.
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
    // off. Closing the context alone leaves the tab showing as listening,
    // which for a microphone is not a cosmetic difference.
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
       * Connecting to the destination is what keeps the graph rendering: a
       * node with no path to the output is not guaranteed to be pulled, and
       * the symptom is a worklet whose `process` is simply never called.
       *
       * It causes no feedback. The worklet writes nothing to its outputs, so
       * the node emits silence; the connection exists to keep the clock
       * running, not to make a sound.
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
