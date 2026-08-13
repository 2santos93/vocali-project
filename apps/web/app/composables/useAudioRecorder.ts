import {
  REALTIME_AUDIO_FORMAT,
  RealtimeSessionResponseSchema,
  TranscriptionSchema,
} from '@vocali/contracts';
import type {
  RealtimeSessionResponse,
  SaveRealtimeTranscriptionRequest,
  Transcription,
  TranscriptionLanguage,
} from '@vocali/contracts';
import { computed, readonly, ref } from 'vue';
import type { ComputedRef, DeepReadonly, Ref } from 'vue';
import { REALTIME_SESSIONS_PATH, REALTIME_TRANSCRIPTIONS_PATH } from '../utils/api-routes';
import { readStatusCode } from '../utils/http-failure';
import { HTTP_UNAUTHORIZED } from '../utils/http-status';
import type { ApiRequester } from './useFileUpload';

/**
 * Dictating into the microphone and having it transcribed as you speak.
 *
 * Like `useFileUpload`, nothing here opens a connection of its own: the
 * session request, the socket and the save are all collaborators the page
 * supplies. That is what lets Jest drive a socket that drops halfway through a
 * sentence, which is the failure this screen exists to survive.
 */

/** The URL the browser fetches the worklet module from. `public/` is served at the site root. */
export const PCM_ENCODER_WORKLET_URL = '/worklets/pcm-encoder.js';

/** Must match the name `registerProcessor` is called with inside the worklet. */
export const PCM_ENCODER_PROCESSOR_NAME = 'pcm-encoder';

const MILLISECONDS_PER_SECOND = 1000;

const WEBSOCKET_OPEN = 1;

/** A normal closure, which is the one the client asks for after a clean stop. */
const CLOSE_NORMAL = 1000;
const CLOSE_INTERNAL_ERROR = 1011;
/** The provider's own range. Documented in planning/phase-2-provider-integration-notes.md. */
const CLOSE_NOT_AUTHORISED = 4001;
const CLOSE_QUOTA_EXCEEDED = 4005;
const CLOSE_JOB_ERROR = 4013;

/**
 * How long to wait for the provider to flush its last words after
 * `EndOfStream`.
 *
 * Bounded, because a provider that never answers must not leave the interface
 * stuck on "finalizando" holding text the user cannot save. On expiry the
 * transcript is saved as it stands rather than discarded.
 */
const DRAIN_TIMEOUT_MS = 5000;

export type MicrophoneFailureCode = 'PERMISSION_DENIED' | 'NO_MICROPHONE' | 'CAPTURE_FAILED';

export class MicrophoneError extends Error {
  public readonly code: MicrophoneFailureCode;

  constructor(code: MicrophoneFailureCode, message: string) {
    super(message);
    this.name = 'MicrophoneError';
    this.code = code;
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
    return new MicrophoneError(
      'PERMISSION_DENIED',
      'No podemos usar el micrófono porque el navegador ha denegado el permiso. Actívalo desde el icono de la barra de direcciones y vuelve a intentarlo.',
    );
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  ) {
    return new MicrophoneError(
      'NO_MICROPHONE',
      'No hemos encontrado ningún micrófono disponible. Conecta uno y vuelve a intentarlo.',
    );
  }
  return new MicrophoneError(
    'CAPTURE_FAILED',
    'No hemos podido abrir el micrófono. Comprueba que ninguna otra aplicación lo esté usando y vuelve a intentarlo.',
  );
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
        : new MicrophoneError(
            'CAPTURE_FAILED',
            'No hemos podido preparar la captura de audio en este navegador. Prueba con Chrome o Firefox actualizados.',
          );
    }
  }

  return { start, stop };
}

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

export type RecordingFailureCode =
  | 'MICROPHONE_DENIED'
  | 'MICROPHONE_UNAVAILABLE'
  | 'SESSION_UNAVAILABLE'
  | 'SESSION_EXPIRED'
  | 'CONNECTION_LOST'
  | 'PROVIDER_QUOTA_EXCEEDED'
  | 'PROVIDER_FAILED'
  | 'NOTHING_TO_SAVE'
  | 'SAVE_FAILED';

export interface RecordingFailure {
  readonly code: RecordingFailureCode;
  /** Spanish, and specific enough to act on. */
  readonly message: string;
  /**
   * Whether there is transcribed text still on screen that the user can save.
   *
   * Losing a clinician's dictation to a dropped socket is the worst thing this
   * screen can do, so a failure that leaves text behind is treated as a
   * recovery offer rather than as a dead end.
   */
  readonly recoverable: boolean;
}

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

/**
 * The two API calls a dictation makes, bound to their paths.
 *
 * Separated from the page for the same reason as `createUploadRequests`: a
 * page is the one layer Jest never mounts, so a path living only in a page is
 * a path nothing asserts until it 404s on a deployed environment.
 *
 * The paths are the ones the API serves — `POST /realtime-sessions` and
 * `POST /transcriptions/realtime` — with `/api` prefixed for the proxy.
 */
export function createRealtimeRequests(
  request: ApiRequester,
): Pick<AudioRecorderDependencies, 'createSession' | 'saveTranscription'> {
  return {
    async createSession(): Promise<RealtimeSessionResponse> {
      const response = await request(REALTIME_SESSIONS_PATH, { method: 'POST' });
      /*
       * Validation matters more here than anywhere else in the front end.
       * This response carries the credential and the sample rate the capture
       * is built from, and a wrong rate does not fail — it transcribes noise,
       * convincingly enough that nothing downstream can tell.
       */
      return RealtimeSessionResponseSchema.parse(response);
    },

    async saveTranscription(dictation: SaveRealtimeTranscriptionRequest): Promise<Transcription> {
      const response = await request(REALTIME_TRANSCRIPTIONS_PATH, {
        method: 'POST',
        body: { ...dictation },
      });
      return TranscriptionSchema.parse(response);
    },
  };
}

export interface AudioRecorderController {
  readonly phase: DeepReadonly<Ref<RecordingPhase>>;
  /** Everything the provider has confirmed. Rendered as settled text. */
  readonly finalText: DeepReadonly<Ref<string>>;
  /** The provisional tail, which the provider may still revise. Rendered as such. */
  readonly partialText: DeepReadonly<Ref<string>>;
  readonly failure: DeepReadonly<Ref<RecordingFailure | null>>;
  readonly transcription: DeepReadonly<Ref<Transcription | null>>;
  readonly isRecording: ComputedRef<boolean>;
  readonly isBusy: ComputedRef<boolean>;
  readonly hasRecoverableText: ComputedRef<boolean>;
  /*
   * Properties holding functions rather than methods: they are closures over
   * the state above and have no receiver, so a page may destructure them off
   * the controller without the type calling it unsafe.
   */
  readonly start: (language: TranscriptionLanguage) => Promise<void>;
  readonly stop: () => Promise<void>;
  /** Persists what survived a failure, so a dropped socket costs nothing but time. */
  readonly saveRecoveredText: () => Promise<void>;
  /** Also releases the microphone and the socket, so it is safe to call on unmount. */
  readonly discard: () => Promise<void>;
  readonly dismissFailure: () => void;
}

function propertyOf(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) {
    return undefined;
  }
  return (source as Record<string, unknown>)[key];
}

function stringPropertyOf(source: unknown, key: string): string | null {
  const value = propertyOf(source, key);
  return typeof value === 'string' ? value : null;
}

/**
 * Reads a provider frame without trusting its shape.
 *
 * The socket is a trust boundary: the frames arrive from a third party over a
 * connection this code did not authenticate itself. Asserting a type onto them
 * would turn a protocol change into an undefined-property crash in the middle
 * of a dictation, so every field is read as `unknown` and checked.
 */
function parseProviderFrame(data: unknown): { name: string; payload: unknown } | null {
  if (typeof data !== 'string') {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  const name = stringPropertyOf(payload, 'message');
  return name === null ? null : { name, payload };
}

function transcriptOf(payload: unknown): string {
  return stringPropertyOf(propertyOf(payload, 'metadata'), 'transcript') ?? '';
}

function describeCloseCode(code: number): RecordingFailure {
  if (code === CLOSE_NOT_AUTHORISED) {
    return {
      code: 'SESSION_EXPIRED',
      message:
        'El permiso de transcripción ha caducado y se ha interrumpido la conexión. Guarda lo transcrito y vuelve a empezar para continuar.',
      recoverable: true,
    };
  }
  if (code === CLOSE_QUOTA_EXCEEDED) {
    return {
      code: 'PROVIDER_QUOTA_EXCEEDED',
      message:
        'Se ha agotado la cuota de transcripción en directo. Guarda lo transcrito e inténtalo más tarde.',
      recoverable: true,
    };
  }
  if (code === CLOSE_JOB_ERROR || code === CLOSE_INTERNAL_ERROR) {
    return {
      code: 'PROVIDER_FAILED',
      message:
        'El servicio de transcripción ha fallado y se ha cortado la conexión. Guarda lo transcrito y vuelve a intentarlo en unos segundos.',
      recoverable: true,
    };
  }
  return {
    code: 'CONNECTION_LOST',
    message:
      'Se ha perdido la conexión con el servicio de transcripción. No se ha perdido nada de lo transcrito hasta ahora: guárdalo y vuelve a empezar.',
    recoverable: true,
  };
}

export function useAudioRecorder(dependencies: AudioRecorderDependencies): AudioRecorderController {
  const phase = ref<RecordingPhase>('idle');
  const finalText = ref('');
  const partialText = ref('');
  const failure = ref<RecordingFailure | null>(null);
  const transcription = ref<Transcription | null>(null);

  let socket: WebSocket | null = null;
  let language: TranscriptionLanguage = 'es';
  let framesSent = 0;
  let startedAtMs: number | null = null;
  let endedAtMs: number | null = null;
  /** Set before the client closes the socket itself, so its own close is not read as a drop. */
  let closingDeliberately = false;
  let onDrained: (() => void) | null = null;

  const isRecording = computed<boolean>(() => phase.value === 'recording');

  const isBusy = computed<boolean>(
    () =>
      phase.value === 'preparing' ||
      phase.value === 'connecting' ||
      phase.value === 'recording' ||
      phase.value === 'finishing' ||
      phase.value === 'saving',
  );

  const spokenText = computed<string>(() =>
    [finalText.value, partialText.value].filter((part) => part !== '').join(' '),
  );

  const hasRecoverableText = computed<boolean>(
    () => failure.value?.recoverable === true && spokenText.value !== '',
  );

  function durationSeconds(): number {
    if (startedAtMs === null) {
      return 0;
    }
    const finishedAt = endedAtMs ?? dependencies.now();
    return Math.max(0, (finishedAt - startedAtMs) / MILLISECONDS_PER_SECOND);
  }

  function releaseSocket(): void {
    if (socket === null) {
      return;
    }
    closingDeliberately = true;
    socket.close(CLOSE_NORMAL);
    socket = null;
  }

  async function teardown(): Promise<void> {
    endedAtMs ??= dependencies.now();
    await dependencies.capture.stop();
    releaseSocket();
  }

  async function fail(reason: RecordingFailure): Promise<void> {
    await teardown();
    failure.value = reason;
    phase.value = 'failed';
  }

  function sendJson(payload: unknown): void {
    if (socket === null || socket.readyState !== WEBSOCKET_OPEN) {
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  function persist(): Promise<void> {
    const text = spokenText.value.trim();

    if (text === '') {
      failure.value = {
        code: 'NOTHING_TO_SAVE',
        message: 'No hemos captado nada de voz, así que no hay texto que guardar.',
        recoverable: false,
      };
      phase.value = 'failed';
      return Promise.resolve();
    }

    phase.value = 'saving';
    return dependencies
      .saveTranscription({ text, durationSeconds: durationSeconds(), language })
      .then((saved) => {
        transcription.value = saved;
        failure.value = null;
        phase.value = 'saved';
      })
      .catch((error: unknown) => {
        /*
         * The text stays on screen and stays recoverable. A failed save is the
         * one moment where the dictation exists only in this tab, so the
         * message has to invite another attempt rather than read as a
         * dead end.
         */
        failure.value = {
          code: 'SAVE_FAILED',
          message:
            readStatusCode(error) === HTTP_UNAUTHORIZED
              ? 'Tu sesión ha caducado antes de guardar. Inicia sesión en otra pestaña y vuelve a pulsar «Guardar»: el texto sigue aquí.'
              : 'No hemos podido guardar la transcripción. El texto sigue en pantalla; vuelve a intentarlo.',
          recoverable: true,
        };
        phase.value = 'failed';
      });
  }

  function handleProviderFrame(data: unknown): void {
    const frame = parseProviderFrame(data);
    if (frame === null) {
      return;
    }

    if (frame.name === 'RecognitionStarted') {
      void beginCapture();
      return;
    }

    if (frame.name === 'AddPartialTranscript') {
      partialText.value = transcriptOf(frame.payload);
      return;
    }

    if (frame.name === 'AddTranscript') {
      const confirmed = transcriptOf(frame.payload);
      // The provider sends its confirmed text with the spacing already in it,
      // so the segments are concatenated rather than joined with a space —
      // joining would double every gap between sentences.
      finalText.value += confirmed;
      // Cleared only now. The partial is the provisional version of exactly
      // this text, and dropping it any earlier makes the tail flicker away and
      // back on every confirmation.
      partialText.value = '';
      return;
    }

    if (frame.name === 'EndOfTranscript') {
      onDrained?.();
      onDrained = null;
      return;
    }

    if (frame.name === 'Error') {
      const type = stringPropertyOf(frame.payload, 'type');
      void fail(
        type === 'not_authorised' || type === 'invalid_token'
          ? describeCloseCode(CLOSE_NOT_AUTHORISED)
          : describeCloseCode(CLOSE_JOB_ERROR),
      );
    }
  }

  async function beginCapture(): Promise<void> {
    try {
      await dependencies.capture.start({
        /*
         * The contract's rate, not a number restated here. The `AudioContext`
         * is constructed at it rather than resampled afterwards, and it is
         * needed before a session exists — so it cannot be read off the
         * session response, and a copy that drifted would not fail: it would
         * transcribe noise, convincingly enough that nothing downstream could
         * tell.
         */
        sampleRate: REALTIME_AUDIO_FORMAT.sampleRate,
        onFrame: (frame: ArrayBuffer) => {
          if (socket === null || socket.readyState !== WEBSOCKET_OPEN) {
            return;
          }
          socket.send(frame);
          framesSent += 1;
        },
      });
    } catch (error: unknown) {
      const code = error instanceof MicrophoneError ? error.code : 'CAPTURE_FAILED';
      await fail({
        code: code === 'PERMISSION_DENIED' ? 'MICROPHONE_DENIED' : 'MICROPHONE_UNAVAILABLE',
        message:
          error instanceof MicrophoneError
            ? error.message
            : 'No hemos podido abrir el micrófono. Vuelve a intentarlo.',
        recoverable: false,
      });
      return;
    }

    startedAtMs = dependencies.now();
    phase.value = 'recording';
  }

  async function start(chosenLanguage: TranscriptionLanguage): Promise<void> {
    await discard();
    language = chosenLanguage;
    phase.value = 'preparing';

    let session: RealtimeSessionResponse;
    try {
      session = await dependencies.createSession();
    } catch (error: unknown) {
      failure.value =
        readStatusCode(error) === HTTP_UNAUTHORIZED
          ? {
              code: 'SESSION_EXPIRED',
              message: 'Tu sesión ha caducado. Vuelve a iniciar sesión para dictar.',
              recoverable: false,
            }
          : {
              code: 'SESSION_UNAVAILABLE',
              message:
                'No hemos podido preparar la sesión de dictado. Inténtalo de nuevo en unos segundos.',
              recoverable: false,
            };
      phase.value = 'failed';
      return;
    }

    phase.value = 'connecting';
    closingDeliberately = false;
    framesSent = 0;

    /*
     * The credential travels as a query parameter because that is the only
     * place the provider's websocket handshake accepts one — a browser
     * WebSocket cannot set an Authorization header. Built through `URL` rather
     * than concatenated so a websocketUrl that already carries a query string
     * does not produce a second `?`.
     */
    const url = new URL(session.websocketUrl);
    url.searchParams.set('jwt', session.token);

    const opened = dependencies.createSocket(url.toString());
    socket = opened;
    opened.binaryType = 'arraybuffer';

    opened.addEventListener('open', () => {
      sendJson({
        message: 'StartRecognition',
        // Straight from the session the API minted, rather than restated here.
        // The provider rejects a mismatch, but only after the socket is open
        // and the user has already started speaking.
        audio_format: {
          type: session.audioFormat.type,
          encoding: session.audioFormat.encoding,
          sample_rate: session.audioFormat.sampleRate,
        },
        transcription_config: {
          language: chosenLanguage,
          operating_point: 'enhanced',
          enable_partials: true,
        },
      });
    });

    opened.addEventListener('message', (event: MessageEvent<unknown>) => {
      handleProviderFrame(event.data);
    });

    opened.addEventListener('close', (event: CloseEvent) => {
      if (closingDeliberately || phase.value === 'saved' || phase.value === 'saving') {
        return;
      }
      socket = null;
      // A drain still in flight must not hang on a socket that has gone.
      onDrained?.();
      onDrained = null;
      void fail(describeCloseCode(event.code));
    });

    opened.addEventListener('error', () => {
      // The error event carries no detail by design, and it is always followed
      // by a close event. Failing here as well would overwrite the specific
      // message the close code affords with a vague one.
    });
  }

  /**
   * Ends the dictation cleanly: stop the microphone, tell the provider no more
   * audio is coming, wait for its last words, then save.
   */
  async function stop(): Promise<void> {
    if (phase.value !== 'recording' && phase.value !== 'connecting') {
      return;
    }

    phase.value = 'finishing';
    endedAtMs = dependencies.now();

    // Armed before anything is awaited. Releasing the microphone takes a turn
    // of the event loop, and a provider frame that arrives during it would
    // otherwise land with nothing listening for it and leave the drain waiting
    // for a message that has already been and gone.
    const drained = new Promise<void>((resolve) => {
      onDrained = resolve;
    });

    await dependencies.capture.stop();
    sendJson({ message: 'EndOfStream', last_seq_no: framesSent });

    // Whichever comes first. The transcript is saved either way: a provider
    // that never sends EndOfTranscript must not cost the user their dictation.
    await Promise.race([drained, dependencies.wait(DRAIN_TIMEOUT_MS)]);
    onDrained = null;

    releaseSocket();
    await persist();
  }

  async function saveRecoveredText(): Promise<void> {
    if (spokenText.value.trim() === '') {
      return;
    }
    await persist();
  }

  /**
   * Throws the dictation away and puts every resource back.
   *
   * It releases the microphone as well as the socket, because this is what a
   * page calls when it is being unmounted: a user who navigates away
   * mid-dictation must not leave the tab holding the device with the browser's
   * recording indicator still lit.
   */
  async function discard(): Promise<void> {
    onDrained = null;
    await teardown();
    phase.value = 'idle';
    finalText.value = '';
    partialText.value = '';
    failure.value = null;
    transcription.value = null;
    framesSent = 0;
    startedAtMs = null;
    endedAtMs = null;
  }

  function dismissFailure(): void {
    failure.value = null;
  }

  return {
    phase: readonly(phase),
    finalText: readonly(finalText),
    partialText: readonly(partialText),
    failure: readonly(failure),
    transcription: readonly(transcription),
    isRecording,
    isBusy,
    hasRecoverableText,
    start,
    stop,
    saveRecoveredText,
    discard,
    dismissFailure,
  };
}
