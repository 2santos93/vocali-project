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
import type { ApiRequester } from '../utils/api-request';
import { REALTIME_SESSIONS_PATH, REALTIME_TRANSCRIPTIONS_PATH } from '../utils/api-routes';
import type { AudioCapture } from './audio-capture';
import {
  buildEndOfStream,
  buildStartRecognition,
  CLOSE_JOB_ERROR,
  CLOSE_NORMAL,
  CLOSE_NOT_AUTHORISED,
  errorTypeOf,
  parseProviderFrame,
  transcriptOf,
} from './realtime-provider-protocol';
import {
  describeCloseCode,
  describeMicrophoneFailure,
  describeSaveFailure,
  describeSessionFailure,
  NOTHING_TO_SAVE,
} from './recording-failures';
import type { RecordingFailure, RecordingPhase } from './recording-failures';

/**
 * Dictating into the microphone and having it transcribed as you speak.
 *
 * Like `useFileUpload`, nothing here opens a connection of its own: the
 * session request, the socket and the save are all collaborators the page
 * supplies. That is what lets Jest drive a socket that drops halfway through a
 * sentence, which is the failure this screen exists to survive.
 *
 * Three collaborators carry what this file used to hold as well. The
 * microphone is in `audio-capture`, the messages crossing the socket are in
 * `realtime-provider-protocol`, and what the user is told when any of it fails
 * is in `recording-failures`, which also holds the phase and failure
 * vocabulary this file moves through. What remains is the state machine they
 * feed: which phase the dictation is in, what text has been confirmed, and
 * when the transcript is safe to persist.
 */

const MILLISECONDS_PER_SECOND = 1000;

const WEBSOCKET_OPEN = 1;

/**
 * How long to wait for the provider to flush its last words after
 * `EndOfStream`.
 *
 * Bounded, because a provider that never answers must not leave the interface
 * stuck on "finalizando" holding text the user cannot save. On expiry the
 * transcript is saved as it stands rather than discarded.
 */
const DRAIN_TIMEOUT_MS = 5000;

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
      failure.value = NOTHING_TO_SAVE;
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
        // The text stays on screen, because the failure it is given says so.
        failure.value = describeSaveFailure(error);
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
      const type = errorTypeOf(frame.payload);
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
      await fail(describeMicrophoneFailure(error));
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
      failure.value = describeSessionFailure(error);
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
      sendJson(buildStartRecognition(session.audioFormat, chosenLanguage));
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
    sendJson(buildEndOfStream(framesSent));

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
