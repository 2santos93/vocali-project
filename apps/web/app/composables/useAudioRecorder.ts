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
import { REALTIME_SESSIONS_PATH, REALTIME_TRANSCRIPTIONS_PATH } from '../utils/api-routes';
import type { ApiRequester } from '../utils/types/api';
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
import type {
  AudioRecorderController,
  AudioRecorderDependencies,
  RecordingFailure,
  RecordingPhase,
} from './types/recording';

const MILLISECONDS_PER_SECOND = 1000;

const WEBSOCKET_OPEN = 1;

const DRAIN_TIMEOUT_MS = 5000;

export function createRealtimeRequests(
  request: ApiRequester,
): Pick<AudioRecorderDependencies, 'createSession' | 'saveTranscription'> {
  return {
    async createSession(): Promise<RealtimeSessionResponse> {
      const response = await request(REALTIME_SESSIONS_PATH, { method: 'POST' });
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
      // Concatenated rather than joined with a space: the provider's confirmed
      // text already carries its spacing, and joining doubles every gap.
      finalText.value += confirmed;
      // Cleared only now: the partial is the provisional version of exactly
      // this text, so dropping it earlier makes the tail flicker.
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
      // Deliberately empty: the error event carries no detail and is always
      // followed by a close event, whose code affords a specific message.
    });
  }

  async function stop(): Promise<void> {
    if (phase.value !== 'recording' && phase.value !== 'connecting') {
      return;
    }

    phase.value = 'finishing';
    endedAtMs = dependencies.now();

    const drained = new Promise<void>((resolve) => {
      onDrained = resolve;
    });

    await dependencies.capture.stop();
    sendJson(buildEndOfStream(framesSent));

    // The transcript is saved either way: a provider that never sends
    // EndOfTranscript must not cost the user their dictation.
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
