import type {
  RealtimeSessionResponse,
  SaveRealtimeTranscriptionRequest,
  Transcription,
} from '@vocali/contracts';
import {
  createRealtimeRequests,
  createWorkletAudioCapture,
  MicrophoneError,
  PCM_ENCODER_PROCESSOR_NAME,
  PCM_ENCODER_WORKLET_URL,
  useAudioRecorder,
} from './useAudioRecorder';
import type { ApiRequestOptions, ApiRequester } from './useFileUpload';
import type {
  AudioCapture,
  AudioCaptureDependencies,
  AudioCaptureOptions,
  AudioRecorderDependencies,
} from './useAudioRecorder';

const SESSION: RealtimeSessionResponse = {
  token: 'jwt-abc123',
  websocketUrl: 'wss://eu.rt.speechmatics.com/v2',
  expiresAt: '2026-08-11T10:01:00.000Z',
  audioFormat: { type: 'raw', encoding: 'pcm_s16le', sampleRate: 16_000 },
};

const SAVED: Transcription = {
  id: 't-9',
  fileName: 'Dictado 11-08-2026',
  source: 'MICROPHONE',
  status: 'COMPLETED',
  language: 'es',
  durationSeconds: 12,
  sizeBytes: null,
  textPreview: 'El paciente refiere dolor lumbar.',
  errorMessage: null,
  createdAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:00:12.000Z',
};

/**
 * Lets the pending microtasks settle.
 *
 * The recorder reacts to a socket frame by starting an async chain — release
 * the microphone, close the socket, then publish the failure — so a single
 * `await` lands in the middle of it and sees a half-applied state. Draining
 * the queue is what makes the assertions observe the state a user would.
 */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) {
    await Promise.resolve();
  }
}

function httpError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error('request failed'), { statusCode });
}

/**
 * A DOMException-shaped rejection, without depending on jsdom's constructor.
 *
 * A real `DOMException` is an `Error` carrying a `name` that says which failure
 * it is, so the double is one too: the recorder reads that name and nothing
 * else, and rejecting with a bare object would be a shape the browser never
 * produces.
 */
class FakeMediaError extends Error {
  constructor(name: string) {
    super(name);
    this.name = name;
  }
}

function mediaError(name: string): Error {
  return new FakeMediaError(name);
}

interface SocketDouble {
  readonly socket: WebSocket;
  readonly sentText: string[];
  readonly sentBinary: ArrayBuffer[];
  readonly closes: number[];
  readyState: number;
  open(): void;
  receive(payload: unknown): void;
  receiveRaw(data: unknown): void;
  drop(code: number): void;
}

function socketDouble(): SocketDouble {
  const listeners = new Map<string, ((event: Event) => void)[]>();
  const sentText: string[] = [];
  const sentBinary: ArrayBuffer[] = [];
  const closes: number[] = [];

  const double: SocketDouble = {
    sentText,
    sentBinary,
    closes,
    readyState: 0,

    socket: {
      binaryType: 'blob',
      addEventListener(type: string, listener: (event: Event) => void): void {
        const existing = listeners.get(type) ?? [];
        existing.push(listener);
        listeners.set(type, existing);
      },
      send(payload: string | ArrayBuffer): void {
        if (typeof payload === 'string') {
          sentText.push(payload);
        } else {
          sentBinary.push(payload);
        }
      },
      close(code: number): void {
        closes.push(code);
        double.readyState = 3;
      },
      get readyState(): number {
        return double.readyState;
      },
    } as unknown as WebSocket,

    open(): void {
      double.readyState = 1;
      for (const listener of listeners.get('open') ?? []) {
        listener(new Event('open'));
      }
    },

    receive(payload: unknown): void {
      double.receiveRaw(JSON.stringify(payload));
    },

    receiveRaw(data: unknown): void {
      for (const listener of listeners.get('message') ?? []) {
        listener({ data } as MessageEvent);
      }
    },

    drop(code: number): void {
      double.readyState = 3;
      for (const listener of listeners.get('close') ?? []) {
        listener({ code, reason: '', wasClean: false } as CloseEvent);
      }
    },
  };

  return double;
}

interface CaptureDouble extends AudioCapture {
  readonly starts: AudioCaptureOptions[];
  stopCount: number;
  failWith: Error | null;
  /** Pushes a frame the way the worklet's message port would. */
  emitFrame(frame: ArrayBuffer): void;
}

function captureDouble(): CaptureDouble {
  const starts: AudioCaptureOptions[] = [];

  const double: CaptureDouble = {
    starts,
    stopCount: 0,
    failWith: null,

    start(options: AudioCaptureOptions): Promise<void> {
      if (double.failWith !== null) {
        return Promise.reject(double.failWith);
      }
      starts.push(options);
      return Promise.resolve();
    },
    stop(): Promise<void> {
      double.stopCount += 1;
      return Promise.resolve();
    },
    emitFrame(frame: ArrayBuffer): void {
      starts[starts.length - 1]?.onFrame(frame);
    },
  };

  return double;
}

interface RecorderHarness extends AudioRecorderDependencies {
  readonly sockets: SocketDouble[];
  readonly urls: string[];
  readonly saves: SaveRealtimeTranscriptionRequest[];
  readonly capture: CaptureDouble;
  onCreateSession: () => Promise<RealtimeSessionResponse>;
  onSave: () => Promise<Transcription>;
  /** Resolves the drain race, standing in for the timeout elapsing. */
  releaseDrainTimeout: () => void;
  clock: number;
}

function harness(): RecorderHarness {
  const sockets: SocketDouble[] = [];
  const urls: string[] = [];
  const saves: SaveRealtimeTranscriptionRequest[] = [];
  const capture = captureDouble();
  let releaseWait: (() => void) | null = null;

  const dependencies: RecorderHarness = {
    sockets,
    urls,
    saves,
    capture,
    clock: 1_000_000,
    onCreateSession: () => Promise.resolve(SESSION),
    onSave: () => Promise.resolve(SAVED),

    createSession(): Promise<RealtimeSessionResponse> {
      return dependencies.onCreateSession();
    },
    saveTranscription(request: SaveRealtimeTranscriptionRequest): Promise<Transcription> {
      saves.push(request);
      return dependencies.onSave();
    },
    createSocket(url: string): WebSocket {
      urls.push(url);
      const double = socketDouble();
      sockets.push(double);
      return double.socket;
    },
    now(): number {
      return dependencies.clock;
    },
    /*
     * Never resolves unless a test asks it to. The drain is a race between the
     * provider's last words and this timeout, so a `wait` that resolved
     * immediately would make every test take the timeout branch and none of
     * them would exercise the path a real provider takes.
     */
    wait(): Promise<void> {
      return new Promise<void>((resolve) => {
        releaseWait = resolve;
      });
    },
    releaseDrainTimeout(): void {
      releaseWait?.();
    },
  };

  return dependencies;
}

/** Runs the recorder up to the point where the provider is streaming. */
async function recordingHarness(): Promise<{
  deps: RecorderHarness;
  controller: ReturnType<typeof useAudioRecorder>;
  socket: SocketDouble;
}> {
  const deps = harness();
  const controller = useAudioRecorder(deps);
  await controller.start('es');
  const socket = deps.sockets[0]!;
  socket.open();
  socket.receive({ message: 'RecognitionStarted', id: 'r-1' });
  // `beginCapture` is started from the message handler, so one turn of the
  // microtask queue has to pass before the phase settles.
  await flush();

  // `start` tears down whatever came before it, which counts as a stop even
  // when there was nothing to stop. Zeroing here means the assertions below
  // measure the release of *this* dictation's microphone and nothing else.
  deps.capture.stopCount = 0;

  return { deps, controller, socket };
}

interface RecordedRequest {
  readonly path: string;
  readonly options: ApiRequestOptions;
}

function requesterReturning(response: unknown): {
  request: ApiRequester;
  calls: RecordedRequest[];
} {
  const calls: RecordedRequest[] = [];
  return {
    calls,
    request: (path, options): Promise<unknown> => {
      calls.push({ path, options });
      return Promise.resolve(response);
    },
  };
}

/*
 * The paths the dictation asks for. As with the upload requests, these cannot
 * prove the API serves them — the routes live only as prose on the Lambda
 * entry points, with no route table in `infra/` to check against — but they do
 * catch a path, method or body being changed, which nothing else would until a
 * deployed environment answered 404.
 */
describe('createRealtimeRequests', () => {
  it('mints a session at POST /api/realtime-sessions, with no body', async () => {
    const { request, calls } = requesterReturning(SESSION);

    await createRealtimeRequests(request).createSession();

    expect(calls).toEqual([{ path: '/api/realtime-sessions', options: { method: 'POST' } }]);
  });

  it('saves a dictation at POST /api/transcriptions/realtime', async () => {
    const { request, calls } = requesterReturning(SAVED);

    await createRealtimeRequests(request).saveTranscription({
      text: 'El paciente refiere dolor lumbar.',
      durationSeconds: 12,
      language: 'es',
    });

    expect(calls).toEqual([
      {
        path: '/api/transcriptions/realtime',
        options: {
          method: 'POST',
          body: {
            text: 'El paciente refiere dolor lumbar.',
            durationSeconds: 12,
            language: 'es',
          },
        },
      },
    ]);
  });

  it('returns the session the API minted', async () => {
    const { request } = requesterReturning(SESSION);

    await expect(createRealtimeRequests(request).createSession()).resolves.toEqual(SESSION);
  });

  /*
   * This response carries the credential and the sample rate the capture is
   * built from. A wrong rate does not fail — it transcribes noise convincingly
   * enough that nothing downstream can tell — so it is checked rather than
   * assumed.
   */
  it('refuses a session whose audio format is not what the contract promises', async () => {
    const { request } = requesterReturning({
      ...SESSION,
      audioFormat: { type: 'raw', encoding: 'pcm_s16le', sampleRate: 44_100 },
    });

    await expect(createRealtimeRequests(request).createSession()).rejects.toThrow();
  });

  it('refuses a session with no credential in it', async () => {
    const { request } = requesterReturning({ ...SESSION, token: '' });

    await expect(createRealtimeRequests(request).createSession()).rejects.toThrow();
  });

  it('refuses a saved record the contract does not describe', async () => {
    const { request } = requesterReturning({ id: 't-9' });

    await expect(
      createRealtimeRequests(request).saveTranscription({
        text: 'Algo.',
        durationSeconds: 1,
        language: 'es',
      }),
    ).rejects.toThrow();
  });
});

describe('createWorkletAudioCapture', () => {
  interface CaptureHarness extends AudioCaptureDependencies {
    readonly contextOptions: AudioContextOptions[];
    readonly addedModules: string[];
    readonly nodeNames: string[];
    readonly connections: string[];
    readonly stoppedTracks: number[];
    contextClosed: number;
    microphoneRejection: Error | null;
    workletRejection: Error | null;
    port: { onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null };
  }

  function captureHarness(): CaptureHarness {
    const contextOptions: AudioContextOptions[] = [];
    const addedModules: string[] = [];
    const nodeNames: string[] = [];
    const connections: string[] = [];
    const stoppedTracks: number[] = [];

    const port: CaptureHarness['port'] = { onmessage: null };

    const deps: CaptureHarness = {
      contextOptions,
      addedModules,
      nodeNames,
      connections,
      stoppedTracks,
      contextClosed: 0,
      microphoneRejection: null,
      workletRejection: null,
      port,

      requestMicrophone(): Promise<MediaStream> {
        if (deps.microphoneRejection !== null) {
          return Promise.reject(deps.microphoneRejection);
        }
        let stopped = 0;
        return Promise.resolve({
          getTracks: () => [
            {
              stop: (): void => {
                stopped += 1;
                stoppedTracks.push(stopped);
              },
            },
          ],
        } as unknown as MediaStream);
      },

      createAudioContext(options: AudioContextOptions): AudioContext {
        contextOptions.push(options);
        return {
          audioWorklet: {
            addModule: (url: string): Promise<void> => {
              addedModules.push(url);
              return deps.workletRejection === null
                ? Promise.resolve()
                : Promise.reject(deps.workletRejection);
            },
          },
          destination: { id: 'destination' },
          createMediaStreamSource: () => ({
            connect: (): void => {
              connections.push('source->worklet');
            },
          }),
          close: (): Promise<void> => {
            deps.contextClosed += 1;
            return Promise.resolve();
          },
        } as unknown as AudioContext;
      },

      createWorkletNode(_context: AudioContext, name: string): AudioWorkletNode {
        nodeNames.push(name);
        return {
          port,
          connect: (): void => {
            connections.push('worklet->destination');
          },
          disconnect: (): void => {
            connections.push('disconnect');
          },
        } as unknown as AudioWorkletNode;
      },
    };

    return deps;
  }

  /*
   * The pin for decision 4 of the plan. The provider needs 16 kHz, and the
   * context is constructed at that rate rather than resampled afterwards —
   * resampling in JavaScript costs quality and main-thread time for something
   * the browser will do properly if asked.
   */
  it('constructs the audio context at the rate it was given, not at the device default', async () => {
    const deps = captureHarness();

    await createWorkletAudioCapture(deps).start({ sampleRate: 16_000, onFrame: () => undefined });

    expect(deps.contextOptions).toEqual([{ sampleRate: 16_000 }]);
  });

  it('asks for a single channel, which is what the provider is configured for', async () => {
    const deps = captureHarness();
    const requested: MediaStreamConstraints[] = [];
    const inner = deps.requestMicrophone.bind(deps);
    deps.requestMicrophone = (constraints): Promise<MediaStream> => {
      requested.push(constraints);
      return inner(constraints);
    };

    await createWorkletAudioCapture(deps).start({ sampleRate: 16_000, onFrame: () => undefined });

    expect((requested[0]?.audio as MediaTrackConstraints).channelCount).toBe(1);
  });

  it('loads the worklet module the repository actually ships', async () => {
    const deps = captureHarness();

    await createWorkletAudioCapture(deps).start({ sampleRate: 16_000, onFrame: () => undefined });

    expect(deps.addedModules).toEqual([PCM_ENCODER_WORKLET_URL]);
    expect(deps.nodeNames).toEqual([PCM_ENCODER_PROCESSOR_NAME]);
  });

  /*
   * A node with no path to the output is not guaranteed to be pulled, and the
   * symptom is a worklet whose `process` is never called at all. The worklet
   * writes nothing to its outputs, so the connection is silent.
   */
  it('keeps the graph rendering by connecting the worklet through to the destination', async () => {
    const deps = captureHarness();

    await createWorkletAudioCapture(deps).start({ sampleRate: 16_000, onFrame: () => undefined });

    expect(deps.connections).toEqual(['source->worklet', 'worklet->destination']);
  });

  it('hands every frame the worklet posts to the caller', async () => {
    const deps = captureHarness();
    const frames: ArrayBuffer[] = [];

    await createWorkletAudioCapture(deps).start({
      sampleRate: 16_000,
      onFrame: (frame) => frames.push(frame),
    });
    const frame = new ArrayBuffer(256);
    deps.port.onmessage?.({ data: frame } as MessageEvent<ArrayBuffer>);

    expect(frames).toEqual([frame]);
  });

  /*
   * The one failure a clinician meets on their first visit. "You said no" and
   * "there is no microphone" are fixed in different places, so collapsing them
   * sends the user looking in the wrong one.
   */
  it.each([
    ['NotAllowedError', 'PERMISSION_DENIED', 'ha denegado el permiso'],
    ['SecurityError', 'PERMISSION_DENIED', 'ha denegado el permiso'],
    ['NotFoundError', 'NO_MICROPHONE', 'No hemos encontrado ningún micrófono'],
    ['OverconstrainedError', 'NO_MICROPHONE', 'No hemos encontrado ningún micrófono'],
    ['NotReadableError', 'CAPTURE_FAILED', 'ninguna otra aplicación'],
  ])('reports %s as %s, in Spanish', async (name, code, fragment) => {
    const deps = captureHarness();
    deps.microphoneRejection = mediaError(name);

    const failure = await createWorkletAudioCapture(deps)
      .start({ sampleRate: 16_000, onFrame: () => undefined })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MicrophoneError);
    expect((failure as MicrophoneError).code).toBe(code);
    expect((failure as MicrophoneError).message).toContain(fragment);
    // Nothing was opened, so nothing should have been built either.
    expect(deps.contextOptions).toHaveLength(0);
  });

  /*
   * Without this the microphone stays live after a failed start: the browser
   * keeps showing the tab as recording and the device stays held.
   */
  it('releases the microphone when the worklet fails to load', async () => {
    const deps = captureHarness();
    deps.workletRejection = new Error('addModule failed');

    await expect(
      createWorkletAudioCapture(deps).start({ sampleRate: 16_000, onFrame: () => undefined }),
    ).rejects.toBeInstanceOf(MicrophoneError);

    expect(deps.stoppedTracks).toHaveLength(1);
    expect(deps.contextClosed).toBe(1);
  });

  it('stops the tracks and closes the context on a normal stop', async () => {
    const deps = captureHarness();
    const capture = createWorkletAudioCapture(deps);
    await capture.start({ sampleRate: 16_000, onFrame: () => undefined });

    await capture.stop();

    expect(deps.connections).toContain('disconnect');
    expect(deps.stoppedTracks).toHaveLength(1);
    expect(deps.contextClosed).toBe(1);
  });

  it('is safe to stop when it never started', async () => {
    await expect(createWorkletAudioCapture(captureHarness()).stop()).resolves.toBeUndefined();
  });
});

describe('useAudioRecorder', () => {
  it('starts idle with an empty transcript', () => {
    const controller = useAudioRecorder(harness());

    expect(controller.phase.value).toBe('idle');
    expect(controller.finalText.value).toBe('');
    expect(controller.partialText.value).toBe('');
    expect(controller.isRecording.value).toBe(false);
    expect(controller.hasRecoverableText.value).toBe(false);
  });

  /*
   * A browser WebSocket cannot set an Authorization header, so the provider's
   * short-lived credential has to travel as a query parameter. Built through
   * URL so a websocketUrl that already carries a query string does not get a
   * second question mark.
   */
  it('opens the socket with the session credential attached to the url', async () => {
    const deps = harness();

    await useAudioRecorder(deps).start('es');

    expect(deps.urls[0]).toBe('wss://eu.rt.speechmatics.com/v2?jwt=jwt-abc123');
  });

  it('keeps an existing query string when it attaches the credential', async () => {
    const deps = harness();
    deps.onCreateSession = (): Promise<RealtimeSessionResponse> =>
      Promise.resolve({ ...SESSION, websocketUrl: 'wss://eu.rt.speechmatics.com/v2?region=eu' });

    await useAudioRecorder(deps).start('es');

    expect(deps.urls[0]).toBe('wss://eu.rt.speechmatics.com/v2?region=eu&jwt=jwt-abc123');
  });

  /*
   * The audio format is echoed from the session the API minted rather than
   * restated here. The provider rejects a mismatch, but only after the socket
   * is open and the user has started speaking.
   */
  it('announces the audio format the session specified', async () => {
    const deps = harness();
    await useAudioRecorder(deps).start('ca');

    deps.sockets[0]!.open();

    expect(JSON.parse(deps.sockets[0]!.sentText[0]!)).toEqual({
      message: 'StartRecognition',
      audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: 16_000 },
      transcription_config: {
        language: 'ca',
        operating_point: 'enhanced',
        enable_partials: true,
      },
    });
  });

  /*
   * Capture begins only once the provider says it is listening. Opening the
   * microphone earlier means the first words are captured with nowhere to send
   * them — a gap at the start of every dictation.
   */
  it('does not open the microphone until the provider acknowledges', async () => {
    const deps = harness();
    const controller = useAudioRecorder(deps);
    await controller.start('es');
    deps.sockets[0]!.open();

    expect(deps.capture.starts).toHaveLength(0);
    expect(controller.phase.value).toBe('connecting');

    deps.sockets[0]!.receive({ message: 'RecognitionStarted', id: 'r-1' });
    await flush();

    expect(deps.capture.starts).toHaveLength(1);
    expect(controller.phase.value).toBe('recording');
    expect(controller.isRecording.value).toBe(true);
  });

  it('captures at the rate the provider requires', async () => {
    const { deps } = await recordingHarness();

    expect(deps.capture.starts[0]?.sampleRate).toBe(16_000);
  });

  it('streams each captured frame down the socket', async () => {
    const { deps, socket } = await recordingHarness();
    const frame = new ArrayBuffer(256);

    deps.capture.emitFrame(frame);
    deps.capture.emitFrame(new ArrayBuffer(256));

    expect(socket.sentBinary).toHaveLength(2);
    expect(socket.sentBinary[0]).toBe(frame);
  });

  it('drops frames rather than throwing once the socket has gone', async () => {
    const { deps, socket } = await recordingHarness();
    socket.readyState = 3;

    expect(() => {
      deps.capture.emitFrame(new ArrayBuffer(4));
    }).not.toThrow();
    expect(socket.sentBinary).toHaveLength(0);
  });

  /*
   * A partial that looks final reads as the system contradicting itself the
   * moment it is revised, so the two are kept in separate fields and the panel
   * renders them differently.
   */
  it('keeps the provisional tail apart from the confirmed text', async () => {
    const { controller, socket } = await recordingHarness();

    socket.receive({ message: 'AddPartialTranscript', metadata: { transcript: 'El paciente re' } });

    expect(controller.partialText.value).toBe('El paciente re');
    expect(controller.finalText.value).toBe('');
  });

  it('replaces the provisional tail as the provider revises it', async () => {
    const { controller, socket } = await recordingHarness();

    socket.receive({ message: 'AddPartialTranscript', metadata: { transcript: 'El paciente re' } });
    socket.receive({
      message: 'AddPartialTranscript',
      metadata: { transcript: 'El paciente refiere' },
    });

    expect(controller.partialText.value).toBe('El paciente refiere');
  });

  it('moves confirmed text into the settled transcript and clears the tail', async () => {
    const { controller, socket } = await recordingHarness();
    socket.receive({ message: 'AddPartialTranscript', metadata: { transcript: 'El paciente re' } });

    socket.receive({
      message: 'AddTranscript',
      metadata: { transcript: 'El paciente refiere dolor.' },
    });

    expect(controller.finalText.value).toBe('El paciente refiere dolor.');
    expect(controller.partialText.value).toBe('');
  });

  // The provider ships its own spacing, so joining the segments with a space
  // would double every gap between sentences.
  it('concatenates confirmed segments without inventing spacing', async () => {
    const { controller, socket } = await recordingHarness();

    socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Primera frase.' } });
    socket.receive({ message: 'AddTranscript', metadata: { transcript: ' Segunda frase.' } });

    expect(controller.finalText.value).toBe('Primera frase. Segunda frase.');
  });

  it.each([
    ['a binary frame', new ArrayBuffer(8)],
    ['text that is not json', 'not json at all'],
    ['json that is not an object', '42'],
    ['an object with no message name', '{"results":[]}'],
  ])('ignores %s rather than crashing mid-dictation', async (_description, data) => {
    const { controller, socket } = await recordingHarness();

    expect(() => {
      socket.receiveRaw(data);
    }).not.toThrow();
    expect(controller.phase.value).toBe('recording');
  });

  it('survives a transcript frame with no transcript in it', async () => {
    const { controller, socket } = await recordingHarness();

    socket.receive({ message: 'AddTranscript', metadata: {} });
    socket.receive({ message: 'AddPartialTranscript' });

    expect(controller.finalText.value).toBe('');
    expect(controller.phase.value).toBe('recording');
  });

  it('ignores protocol frames it has no use for', async () => {
    const { controller, socket } = await recordingHarness();

    socket.receive({ message: 'AudioAdded', seq_no: 1 });
    socket.receive({ message: 'Info', type: 'recognition_quality' });

    expect(controller.phase.value).toBe('recording');
  });

  describe('stopping cleanly', () => {
    it('stops the microphone, ends the stream and saves what was said', async () => {
      const { deps, controller, socket } = await recordingHarness();
      socket.receive({
        message: 'AddTranscript',
        metadata: { transcript: 'El paciente refiere dolor lumbar.' },
      });
      deps.capture.emitFrame(new ArrayBuffer(4));
      deps.clock += 12_000;

      const stopping = controller.stop();
      await flush();
      socket.receive({ message: 'EndOfTranscript' });
      await stopping;

      expect(deps.capture.stopCount).toBe(1);
      expect(JSON.parse(socket.sentText[1]!)).toEqual({
        message: 'EndOfStream',
        last_seq_no: 1,
      });
      expect(socket.closes).toEqual([1000]);
      expect(deps.saves).toEqual([
        {
          text: 'El paciente refiere dolor lumbar.',
          durationSeconds: 12,
          language: 'es',
        },
      ]);
      expect(controller.phase.value).toBe('saved');
      expect(controller.transcription.value?.id).toBe('t-9');
    });

    it('saves the language the dictation was started in', async () => {
      const deps = harness();
      const controller = useAudioRecorder(deps);
      await controller.start('eu');
      deps.sockets[0]!.open();
      deps.sockets[0]!.receive({ message: 'RecognitionStarted' });
      await flush();
      deps.sockets[0]!.receive({ message: 'AddTranscript', metadata: { transcript: 'Kaixo.' } });

      const stopping = controller.stop();
      await flush();
      deps.sockets[0]!.receive({ message: 'EndOfTranscript' });
      await stopping;

      expect(deps.saves[0]?.language).toBe('eu');
    });

    // The tail the provider never got round to confirming is still something
    // the clinician said, and discarding it silently truncates the dictation.
    it('keeps the unconfirmed tail in what it saves', async () => {
      const { deps, controller, socket } = await recordingHarness();
      socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Primera parte.' } });
      socket.receive({
        message: 'AddPartialTranscript',
        metadata: { transcript: 'segunda parte' },
      });

      const stopping = controller.stop();
      await flush();
      socket.receive({ message: 'EndOfTranscript' });
      await stopping;

      expect(deps.saves[0]?.text).toBe('Primera parte. segunda parte');
    });

    /*
     * A provider that never sends EndOfTranscript must not cost the user their
     * dictation, so the drain is a race and the transcript is saved either way.
     */
    it('saves anyway when the provider never sends its last words', async () => {
      const { deps, controller, socket } = await recordingHarness();
      socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Algo dicho.' } });

      const stopping = controller.stop();
      await flush();
      deps.releaseDrainTimeout();
      await stopping;

      expect(controller.phase.value).toBe('saved');
      expect(deps.saves[0]?.text).toBe('Algo dicho.');
    });

    it('refuses to save an empty dictation and says so', async () => {
      const { deps, controller, socket } = await recordingHarness();

      const stopping = controller.stop();
      await flush();
      socket.receive({ message: 'EndOfTranscript' });
      await stopping;

      expect(deps.saves).toHaveLength(0);
      expect(controller.phase.value).toBe('failed');
      expect(controller.failure.value?.code).toBe('NOTHING_TO_SAVE');
      expect(controller.hasRecoverableText.value).toBe(false);
    });

    it('does nothing when there is no dictation to stop', async () => {
      const deps = harness();
      const controller = useAudioRecorder(deps);

      await controller.stop();

      expect(deps.capture.stopCount).toBe(0);
      expect(controller.phase.value).toBe('idle');
    });

    /*
     * A failed save is the one moment where the dictation exists only in this
     * tab. The text stays on screen and stays recoverable.
     */
    it('keeps the text recoverable when the save fails', async () => {
      const { deps, controller, socket } = await recordingHarness();
      socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Texto valioso.' } });
      deps.onSave = (): Promise<Transcription> => Promise.reject(httpError(500));

      const stopping = controller.stop();
      await flush();
      socket.receive({ message: 'EndOfTranscript' });
      await stopping;

      expect(controller.phase.value).toBe('failed');
      expect(controller.failure.value?.code).toBe('SAVE_FAILED');
      expect(controller.finalText.value).toBe('Texto valioso.');
      expect(controller.hasRecoverableText.value).toBe(true);
    });

    it('says the session expired when the save comes back unauthorised', async () => {
      const { deps, controller, socket } = await recordingHarness();
      socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Texto valioso.' } });
      deps.onSave = (): Promise<Transcription> => Promise.reject(httpError(401));

      const stopping = controller.stop();
      await flush();
      socket.receive({ message: 'EndOfTranscript' });
      await stopping;

      expect(controller.failure.value?.message).toContain('Tu sesión ha caducado');
      expect(controller.failure.value?.message).toContain('el texto sigue aquí');
      expect(controller.hasRecoverableText.value).toBe(true);
    });

    it('saves the recovered text on a second attempt', async () => {
      const { deps, controller, socket } = await recordingHarness();
      socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Texto valioso.' } });
      deps.onSave = (): Promise<Transcription> => Promise.reject(httpError(500));
      const stopping = controller.stop();
      await flush();
      socket.receive({ message: 'EndOfTranscript' });
      await stopping;

      deps.onSave = (): Promise<Transcription> => Promise.resolve(SAVED);
      await controller.saveRecoveredText();

      expect(controller.phase.value).toBe('saved');
      expect(controller.failure.value).toBeNull();
      expect(deps.saves).toHaveLength(2);
    });
  });

  describe('the three failures that will actually happen', () => {
    /*
     * Permission denied. The capture reports why; the recorder must carry that
     * sentence through rather than replace it with a generic one, because the
     * two microphone failures are fixed in different places.
     */
    it('reports a denied microphone with the reason and no recovery offer', async () => {
      const deps = harness();
      deps.capture.failWith = new MicrophoneError(
        'PERMISSION_DENIED',
        'No podemos usar el micrófono porque el navegador ha denegado el permiso.',
      );
      const controller = useAudioRecorder(deps);
      await controller.start('es');
      deps.sockets[0]!.open();

      deps.sockets[0]!.receive({ message: 'RecognitionStarted' });
      await flush();

      expect(controller.phase.value).toBe('failed');
      expect(controller.failure.value?.code).toBe('MICROPHONE_DENIED');
      expect(controller.failure.value?.message).toContain('ha denegado el permiso');
      expect(controller.failure.value?.recoverable).toBe(false);
      // The socket is released rather than left holding a provider session
      // open for audio that will never arrive.
      expect(deps.sockets[0]!.closes).toEqual([1000]);
    });

    it('reports a missing microphone separately from a denied one', async () => {
      const deps = harness();
      deps.capture.failWith = new MicrophoneError('NO_MICROPHONE', 'No hemos encontrado ninguno.');
      const controller = useAudioRecorder(deps);
      await controller.start('es');
      deps.sockets[0]!.open();

      deps.sockets[0]!.receive({ message: 'RecognitionStarted' });
      await flush();

      expect(controller.failure.value?.code).toBe('MICROPHONE_UNAVAILABLE');
    });

    /*
     * The session token expiring mid-recording. The provider signals it either
     * as a close code or as an Error frame, and both have to land on the same
     * message — with the text kept, because the clinician has been speaking.
     */
    it('reports an expired provider credential and keeps the text', async () => {
      const { controller, socket } = await recordingHarness();
      socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Ya dicho.' } });

      socket.drop(4001);
      await flush();

      expect(controller.phase.value).toBe('failed');
      expect(controller.failure.value?.code).toBe('SESSION_EXPIRED');
      expect(controller.finalText.value).toBe('Ya dicho.');
      expect(controller.hasRecoverableText.value).toBe(true);
    });

    it('reports an Error frame saying the credential was refused the same way', async () => {
      const { controller, socket } = await recordingHarness();
      socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Ya dicho.' } });

      socket.receive({ message: 'Error', type: 'not_authorised', reason: 'Not authorised' });
      await flush();

      expect(controller.failure.value?.code).toBe('SESSION_EXPIRED');
      expect(controller.hasRecoverableText.value).toBe(true);
    });

    /*
     * The socket dropping. Losing a clinician's dictation here is the worst
     * outcome this screen has, so the text stays and the message says so.
     */
    it('keeps every word when the socket drops without warning', async () => {
      const { deps, controller, socket } = await recordingHarness();
      socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Primera parte. ' } });
      socket.receive({
        message: 'AddPartialTranscript',
        metadata: { transcript: 'segunda parte' },
      });

      socket.drop(1006);
      await flush();

      expect(controller.phase.value).toBe('failed');
      expect(controller.failure.value?.code).toBe('CONNECTION_LOST');
      expect(controller.failure.value?.message).toContain('No se ha perdido nada');
      expect(controller.hasRecoverableText.value).toBe(true);
      // The microphone is released; leaving it live records into nothing.
      expect(deps.capture.stopCount).toBe(1);
    });

    it('persists the text that survived a dropped socket', async () => {
      const { deps, controller, socket } = await recordingHarness();
      socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Primera parte.' } });
      socket.receive({
        message: 'AddPartialTranscript',
        metadata: { transcript: 'segunda parte' },
      });
      deps.clock += 30_000;
      socket.drop(1006);
      await flush();

      await controller.saveRecoveredText();

      expect(deps.saves).toEqual([
        { text: 'Primera parte. segunda parte', durationSeconds: 30, language: 'es' },
      ]);
      expect(controller.phase.value).toBe('saved');
    });

    it.each([
      [4005, 'PROVIDER_QUOTA_EXCEEDED', 'cuota'],
      [4013, 'PROVIDER_FAILED', 'ha fallado'],
      [1011, 'PROVIDER_FAILED', 'ha fallado'],
      [1006, 'CONNECTION_LOST', 'Se ha perdido la conexión'],
    ])('translates close code %s into its own message', async (code, failureCode, fragment) => {
      const { controller, socket } = await recordingHarness();
      socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Algo.' } });

      socket.drop(code);
      await flush();

      expect(controller.failure.value?.code).toBe(failureCode);
      expect(controller.failure.value?.message).toContain(fragment);
    });

    it('does not offer recovery when the socket dropped before a word was said', async () => {
      const { controller, socket } = await recordingHarness();

      socket.drop(1006);
      await flush();

      expect(controller.failure.value?.recoverable).toBe(true);
      expect(controller.hasRecoverableText.value).toBe(false);
    });

    // The socket the client closes itself must not be reported as a drop.
    it('does not treat its own clean close as a lost connection', async () => {
      const { controller, socket } = await recordingHarness();
      socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Algo.' } });

      const stopping = controller.stop();
      await flush();
      socket.receive({ message: 'EndOfTranscript' });
      await stopping;
      socket.drop(1000);
      await Promise.resolve();

      expect(controller.phase.value).toBe('saved');
      expect(controller.failure.value).toBeNull();
    });

    it('reports a session the API refused, without opening a socket', async () => {
      const deps = harness();
      deps.onCreateSession = (): Promise<RealtimeSessionResponse> => Promise.reject(httpError(503));
      const controller = useAudioRecorder(deps);

      await controller.start('es');

      expect(controller.phase.value).toBe('failed');
      expect(controller.failure.value?.code).toBe('SESSION_UNAVAILABLE');
      expect(deps.sockets).toHaveLength(0);
    });

    it('reports an expired sign-in when the session request is unauthorised', async () => {
      const deps = harness();
      deps.onCreateSession = (): Promise<RealtimeSessionResponse> => Promise.reject(httpError(401));
      const controller = useAudioRecorder(deps);

      await controller.start('es');

      expect(controller.failure.value?.code).toBe('SESSION_EXPIRED');
      expect(controller.failure.value?.message).toContain('Vuelve a iniciar sesión');
    });
  });

  it('clears the previous dictation when a new one starts', async () => {
    const { deps, controller, socket } = await recordingHarness();
    socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Primera consulta.' } });
    socket.drop(1006);
    await flush();

    await controller.start('es');

    expect(controller.finalText.value).toBe('');
    expect(controller.failure.value).toBeNull();
    expect(controller.phase.value).toBe('connecting');
    expect(deps.sockets).toHaveLength(2);
  });

  /*
   * The microphone as well as the socket. This is what a page calls as it is
   * unmounted, and a user who navigates away mid-dictation must not leave the
   * tab holding the device with the recording indicator still lit.
   */
  it('returns to idle and releases both the socket and the microphone', async () => {
    const { deps, controller, socket } = await recordingHarness();
    socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Algo.' } });

    await controller.discard();

    expect(controller.phase.value).toBe('idle');
    expect(controller.finalText.value).toBe('');
    expect(socket.closes).toEqual([1000]);
    expect(deps.capture.stopCount).toBe(1);
  });

  it('is safe to discard a dictation that never started', async () => {
    const deps = harness();
    const controller = useAudioRecorder(deps);

    await controller.discard();

    expect(controller.phase.value).toBe('idle');
    expect(deps.sockets).toHaveLength(0);
  });

  it('lets a failure be dismissed without losing the text', async () => {
    const { controller, socket } = await recordingHarness();
    socket.receive({ message: 'AddTranscript', metadata: { transcript: 'Algo.' } });
    socket.drop(1006);
    await flush();

    controller.dismissFailure();

    expect(controller.failure.value).toBeNull();
    expect(controller.finalText.value).toBe('Algo.');
  });

  it('saves nothing when asked to recover an empty transcript', async () => {
    const { deps, controller } = await recordingHarness();

    await controller.saveRecoveredText();

    expect(deps.saves).toHaveLength(0);
  });

  it('reports itself busy for every phase where a second dictation must not start', async () => {
    const deps = harness();
    const controller = useAudioRecorder(deps);

    await controller.start('es');
    expect(controller.isBusy.value).toBe(true);

    deps.sockets[0]!.open();
    deps.sockets[0]!.receive({ message: 'RecognitionStarted' });
    await flush();
    expect(controller.isBusy.value).toBe(true);

    deps.sockets[0]!.receive({ message: 'AddTranscript', metadata: { transcript: 'Algo.' } });
    const stopping = controller.stop();
    await flush();
    deps.sockets[0]!.receive({ message: 'EndOfTranscript' });
    await stopping;

    expect(controller.isBusy.value).toBe(false);
  });
});
