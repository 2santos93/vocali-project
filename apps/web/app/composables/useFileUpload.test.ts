import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import type {
  CreateUploadIntentRequest,
  CreateUploadIntentResponse,
  Transcription,
} from '@vocali/contracts';
import {
  buildPresignedPostForm,
  createUploadRequests,
  StorageUploadError,
  uploadToPresignedPost,
  useFileUpload,
} from './useFileUpload';
import type {
  ApiRequestOptions,
  ApiRequester,
  FileUploadGateway,
  PresignedPostUpload,
} from './useFileUpload';
import type { TranscriptionUpdateStream, UpdateStreamHandlers } from './useTranscriptionUpdates';

function fileOf(name: string, type: string, size: number): File {
  const file = new File(['audio'], name, { type });
  // jsdom derives size from the content, and allocating twenty megabytes to
  // exercise a twenty-megabyte limit is a slow way to prove nothing extra.
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const AUDIO_FILE = fileOf('consulta-paciente.mp3', 'audio/mpeg', 1_048_576);

const PRESIGNED_FIELDS: Record<string, string> = {
  key: 'users/u-1/t-1/consulta-paciente.mp3',
  'Content-Type': 'audio/mpeg',
  policy: 'eyJleHBpcmF0aW9uIjoi',
  'x-amz-algorithm': 'AWS4-HMAC-SHA256',
  'x-amz-signature': 'a3f1c9',
};

const INTENT_REQUEST: CreateUploadIntentRequest = {
  fileName: 'consulta-paciente.mp3',
  contentType: 'audio/mpeg',
  sizeBytes: 1_048_576,
  language: 'es',
};

const INTENT: CreateUploadIntentResponse = {
  transcriptionId: 't-1',
  upload: {
    url: 'https://vocali-audio.s3.eu-west-1.amazonaws.com/',
    fields: PRESIGNED_FIELDS,
    expiresAt: '2026-08-11T10:05:00.000Z',
  },
};

function transcriptionWith(status: Transcription['status']): Transcription {
  return {
    id: 't-1',
    fileName: 'consulta-paciente.mp3',
    source: 'FILE',
    status,
    language: 'es',
    durationSeconds: 42,
    sizeBytes: 1_048_576,
    textPreview: status === 'COMPLETED' ? 'El paciente refiere…' : null,
    errorMessage: null,
    createdAt: '2026-08-11T10:00:00.000Z',
    updatedAt: '2026-08-11T10:01:00.000Z',
  };
}

/** An error shaped the way ofetch shapes one, without importing ofetch. */
function httpError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`Request failed with status ${String(statusCode)}`), {
    statusCode,
  });
}

interface GatewayDouble extends FileUploadGateway {
  readonly intentRequests: CreateUploadIntentRequest[];
  readonly uploads: PresignedPostUpload[];
  readonly waits: number[];
  readonly transcriptionRequests: string[];
  onCreateIntent: () => Promise<CreateUploadIntentResponse>;
  onUpload: (upload: PresignedPostUpload) => Promise<void>;
  onGetTranscription: (() => Promise<Transcription>) | null;
  /** Records `getTranscription` hands back; the last one repeats. */
  records: Transcription[];

  /** False makes the socket refuse to open, as it does with no network. */
  socketOpens: boolean;
  /** Pushed through the handlers the moment the stream is opened. */
  pushOnOpen: Transcription[];
  /** True ends the socket right after opening, as a dropped connection does. */
  dropOnOpen: boolean;
  streamsOpened: number;
  streamsClosed: number;
}

/**
 * The socket is driven from inside `openUpdateStream` rather than by a test
 * calling a `push` method afterwards, and that is forced rather than stylistic:
 * `upload()` does not return until the record settles, so anything a test does
 * after awaiting it happens too late to be the thing that settled it.
 */
function gatewayDouble(): GatewayDouble {
  const intentRequests: CreateUploadIntentRequest[] = [];
  const uploads: PresignedPostUpload[] = [];
  const waits: number[] = [];
  const transcriptionRequests: string[] = [];

  const gateway: GatewayDouble = {
    intentRequests,
    uploads,
    waits,
    transcriptionRequests,
    records: [],
    onCreateIntent: () => Promise.resolve(INTENT),
    onUpload: () => Promise.resolve(),
    onGetTranscription: null,

    socketOpens: true,
    pushOnOpen: [],
    dropOnOpen: false,
    streamsOpened: 0,
    streamsClosed: 0,

    createUploadIntent(request: CreateUploadIntentRequest): Promise<CreateUploadIntentResponse> {
      intentRequests.push(request);
      return gateway.onCreateIntent();
    },
    uploadToStorage(upload: PresignedPostUpload): Promise<void> {
      uploads.push(upload);
      return gateway.onUpload(upload);
    },

    openUpdateStream(handlers: UpdateStreamHandlers): Promise<TranscriptionUpdateStream> {
      if (!gateway.socketOpens) {
        return Promise.reject(new Error('the update socket could not be opened'));
      }

      gateway.streamsOpened += 1;

      for (const record of gateway.pushOnOpen) {
        handlers.onTranscription(record);
      }
      if (gateway.dropOnOpen) {
        handlers.onClosed();
      }

      return Promise.resolve({
        close: () => {
          gateway.streamsClosed += 1;
        },
      });
    },

    getTranscription(transcriptionId: string): Promise<Transcription> {
      transcriptionRequests.push(transcriptionId);
      if (gateway.onGetTranscription !== null) {
        return gateway.onGetTranscription();
      }
      // The last record keeps being returned once the script runs out, so a
      // test only has to describe the transitions it cares about.
      const next = gateway.records.length > 1 ? gateway.records.shift() : gateway.records[0];
      return next === undefined ? Promise.reject(httpError(404)) : Promise.resolve(next);
    },

    // Resolved immediately: the schedule is asserted through `waits`, so the
    // suite never spends the seven minutes the real budgets allow.
    wait(milliseconds: number): Promise<void> {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  };

  return gateway;
}

describe('buildPresignedPostForm', () => {
  /*
   * The one that costs hours when it is wrong.
   *
   * S3 parses the multipart body in order and stops collecting form fields at
   * the file part. Fields that follow it are ignored, so a body with the file
   * first arrives carrying no policy and no signature, and S3 answers with a
   * policy error that names none of that — after the whole file has been sent.
   */
  it('appends every policy field before the file', () => {
    const form = buildPresignedPostForm(PRESIGNED_FIELDS, AUDIO_FILE);

    const names = Array.from(form.keys());

    expect(names[names.length - 1]).toBe('file');
    expect(names.slice(0, -1)).toEqual(Object.keys(PRESIGNED_FIELDS));
  });

  it('carries every field through unchanged', () => {
    const form = buildPresignedPostForm(PRESIGNED_FIELDS, AUDIO_FILE);

    for (const [name, value] of Object.entries(PRESIGNED_FIELDS)) {
      expect(form.get(name)).toBe(value);
    }
  });

  // `file` is the part name the presigned POST contract requires, not a choice.
  it('sends the file under the part name S3 expects, keeping its name', () => {
    const form = buildPresignedPostForm(PRESIGNED_FIELDS, AUDIO_FILE);

    const part = form.get('file');
    expect(part).toBeInstanceOf(File);
    expect((part as File).name).toBe('consulta-paciente.mp3');
  });

  it('still puts the file last when there are no fields at all', () => {
    expect(Array.from(buildPresignedPostForm({}, AUDIO_FILE).keys())).toEqual(['file']);
  });
});

interface RequestDouble {
  readonly request: XMLHttpRequest;
  readonly opened: { method: string; url: string }[];
  readonly sent: FormData[];
  status: number;
  emit(type: string): void;
  emitUploadProgress(loaded: number, total: number, lengthComputable?: boolean): void;
}

function requestDouble(): RequestDouble {
  const listeners = new Map<string, ((event: Event) => void)[]>();
  const uploadListeners = new Map<string, ((event: ProgressEvent) => void)[]>();
  const opened: { method: string; url: string }[] = [];
  const sent: FormData[] = [];

  function add<T>(map: Map<string, T[]>, type: string, listener: T): void {
    const existing = map.get(type) ?? [];
    existing.push(listener);
    map.set(type, existing);
  }

  const double = {
    opened,
    sent,
    status: 204,
    request: {
      status: 0,
      upload: {
        addEventListener(type: string, listener: (event: ProgressEvent) => void): void {
          add(uploadListeners, type, listener);
        },
      },
      addEventListener(type: string, listener: (event: Event) => void): void {
        add(listeners, type, listener);
      },
      open(method: string, url: string): void {
        opened.push({ method, url });
      },
      send(body: FormData): void {
        sent.push(body);
      },
    } as unknown as XMLHttpRequest,

    emit(type: string): void {
      (double.request as unknown as { status: number }).status = double.status;
      for (const listener of listeners.get(type) ?? []) {
        listener(new Event(type));
      }
    },

    emitUploadProgress(loaded: number, total: number, lengthComputable = true): void {
      for (const listener of uploadListeners.get('progress') ?? []) {
        listener({ loaded, total, lengthComputable } as ProgressEvent);
      }
    },
  };

  return double;
}

describe('uploadToPresignedPost', () => {
  it('POSTs the assembled form to the presigned url', async () => {
    const double = requestDouble();
    const settled = uploadToPresignedPost(
      { url: INTENT.upload.url, fields: PRESIGNED_FIELDS, file: AUDIO_FILE },
      () => double.request,
    );

    double.emit('load');
    await settled;

    expect(double.opened).toEqual([{ method: 'POST', url: INTENT.upload.url }]);
    expect(Array.from(double.sent[0]!.keys())).toContain('policy');
  });

  /*
   * `fetch` exposes a stream for the response and nothing for the request, so
   * it cannot report how much of a body has been sent. A bar driven by a timer
   * instead would be telling the user something the code does not know.
   */
  it('reports progress from the upload progress event', async () => {
    const double = requestDouble();
    const reported: number[] = [];
    const settled = uploadToPresignedPost(
      {
        url: INTENT.upload.url,
        fields: PRESIGNED_FIELDS,
        file: AUDIO_FILE,
        onProgress: (percentage) => reported.push(percentage),
      },
      () => double.request,
    );

    double.emitUploadProgress(250, 1000);
    double.emitUploadProgress(750, 1000);
    double.emit('load');
    await settled;

    expect(reported.slice(0, 2)).toEqual([25, 75]);
  });

  it('finishes the bar at 100 rather than wherever the last event landed', async () => {
    const double = requestDouble();
    const reported: number[] = [];
    const settled = uploadToPresignedPost(
      {
        url: INTENT.upload.url,
        fields: PRESIGNED_FIELDS,
        file: AUDIO_FILE,
        onProgress: (percentage) => reported.push(percentage),
      },
      () => double.request,
    );

    double.emitUploadProgress(980, 1000);
    double.emit('load');
    await settled;

    expect(reported[reported.length - 1]).toBe(100);
  });

  // `total` is 0 until the request has a length, which would make the first
  // event of every upload report NaN.
  it('ignores a progress event that carries no total', async () => {
    const double = requestDouble();
    const reported: number[] = [];
    const settled = uploadToPresignedPost(
      {
        url: INTENT.upload.url,
        fields: PRESIGNED_FIELDS,
        file: AUDIO_FILE,
        onProgress: (percentage) => reported.push(percentage),
      },
      () => double.request,
    );

    double.emitUploadProgress(0, 0, false);
    double.emitUploadProgress(0, 0, true);
    double.emit('load');
    await settled;

    expect(reported).toEqual([100]);
  });

  /*
   * A 403 here is the storage policy doing its job — it is what rejects a file
   * over 20 MB, and it is the control, not the client-side check.
   */
  it('reports a 403 as the storage policy refusing the file, naming the limit', async () => {
    const double = requestDouble();
    double.status = 403;
    const settled = uploadToPresignedPost(
      { url: INTENT.upload.url, fields: PRESIGNED_FIELDS, file: AUDIO_FILE },
      () => double.request,
    );

    double.emit('load');

    await expect(settled).rejects.toBeInstanceOf(StorageUploadError);
    await settled.catch((error: unknown) => {
      expect((error as StorageUploadError).code).toBe('REFUSED');
      expect((error as StorageUploadError).detail).toEqual({
        key: 'failure.upload.storageRefused',
      });
    });
  });

  it('reports any other refusal without pretending to know why', async () => {
    const double = requestDouble();
    double.status = 400;
    const settled = uploadToPresignedPost(
      { url: INTENT.upload.url, fields: PRESIGNED_FIELDS, file: AUDIO_FILE },
      () => double.request,
    );

    double.emit('load');

    await settled.catch((error: unknown) => {
      expect((error as StorageUploadError).detail).toEqual({
        key: 'failure.upload.storageUnavailable',
      });
    });
    await expect(settled).rejects.toBeInstanceOf(StorageUploadError);
  });

  it('accepts any 2xx, since S3 answers a presigned POST with 204', async () => {
    for (const status of [200, 201, 204]) {
      const double = requestDouble();
      double.status = status;
      const settled = uploadToPresignedPost(
        { url: INTENT.upload.url, fields: PRESIGNED_FIELDS, file: AUDIO_FILE },
        () => double.request,
      );

      double.emit('load');

      await expect(settled).resolves.toBeUndefined();
    }
  });

  /*
   * The key, not the sentence. Which of these three the transport produced is
   * this function's decision and is checked here; that each of them reads as a
   * different, useful sentence is checked where the sentence is rendered.
   */
  it.each([
    ['error', 'NETWORK_FAILED', 'failure.upload.connectionLost'],
    ['timeout', 'NETWORK_FAILED', 'failure.upload.timedOut'],
    ['abort', 'ABORTED', 'failure.upload.aborted'],
  ])('reports a transport %s as the failure that fits it', async (event, code, key) => {
    const double = requestDouble();
    const settled = uploadToPresignedPost(
      { url: INTENT.upload.url, fields: PRESIGNED_FIELDS, file: AUDIO_FILE },
      () => double.request,
    );

    double.emit(event);

    await settled.catch((error: unknown) => {
      expect((error as StorageUploadError).code).toBe(code);
      expect((error as StorageUploadError).detail).toEqual({ key });
    });
    await expect(settled).rejects.toBeInstanceOf(StorageUploadError);
  });
});

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
 * These pin the paths the front end asks for.
 *
 * They cannot pin that the API serves them — nothing in this repository can,
 * since the routes exist only as prose on the Lambda entry points and there is
 * no route table anywhere in `infra/`. What they do catch is the path being
 * edited, and the request being built with the wrong method or body, which is
 * otherwise invisible until a 404 on a deployed environment: a page is the one
 * layer Jest never mounts, so a path living only in a page is a path nothing
 * asserts at all.
 */
describe('createUploadRequests', () => {
  it('asks for an upload intent at POST /api/uploads', async () => {
    const { request, calls } = requesterReturning(INTENT);

    await createUploadRequests(request).createUploadIntent({
      fileName: 'consulta-paciente.mp3',
      contentType: 'audio/mpeg',
      sizeBytes: 1_048_576,
      language: 'es',
    });

    expect(calls).toEqual([
      {
        path: '/api/uploads',
        options: {
          method: 'POST',
          body: {
            fileName: 'consulta-paciente.mp3',
            contentType: 'audio/mpeg',
            sizeBytes: 1_048_576,
            language: 'es',
          },
        },
      },
    ]);
  });

  /*
   * The fallback asks for one record, not the history.
   *
   * The path is asserted as a literal rather than imported from
   * `utils/api-routes`, for the reason recorded there: a test that imports the
   * constant it is checking asserts `constant === constant` and would stay
   * green through the path being changed to something the API does not serve.
   */
  it('reads one transcription from GET /api/transcriptions/{id}', async () => {
    const { request, calls } = requesterReturning(transcriptionWith('COMPLETED'));

    await createUploadRequests(request).getTranscription('t-1');

    expect(calls).toEqual([{ path: '/api/transcriptions/t-1', options: { method: 'GET' } }]);
  });

  it('returns the intent the API sent', async () => {
    const { request } = requesterReturning(INTENT);

    await expect(createUploadRequests(request).createUploadIntent(INTENT_REQUEST)).resolves.toEqual(
      INTENT,
    );
  });

  /*
   * Parsed rather than asserted. A type argument on the request would tell the
   * compiler what to assume and check nothing, letting a malformed response
   * through to fail as an undefined property inside the upload instead.
   */
  it('refuses an intent response the contract does not describe', async () => {
    const { request } = requesterReturning({ transcriptionId: 't-1' });

    await expect(
      createUploadRequests(request).createUploadIntent(INTENT_REQUEST),
    ).rejects.toThrow();
  });

  it('refuses a transcription the contract does not describe', async () => {
    const { request } = requesterReturning({ id: 't-1' });

    await expect(createUploadRequests(request).getTranscription('t-1')).rejects.toThrow();
  });
});

describe('useFileUpload', () => {
  it('starts idle with nothing to show', () => {
    const controller = useFileUpload(gatewayDouble());

    expect(controller.phase.value).toBe('idle');
    expect(controller.progress.value).toBe(0);
    expect(controller.failure.value).toBeNull();
    expect(controller.transcription.value).toBeNull();
    expect(controller.isBusy.value).toBe(false);
  });

  it('asks for an intent describing the file and the chosen language', async () => {
    const gateway = gatewayDouble();
    gateway.pushOnOpen = [transcriptionWith('COMPLETED')];

    await useFileUpload(gateway).upload(AUDIO_FILE, 'ca');

    expect(gateway.intentRequests).toEqual([
      {
        fileName: 'consulta-paciente.mp3',
        contentType: 'audio/mpeg',
        sizeBytes: 1_048_576,
        language: 'ca',
      },
    ]);
  });

  it('uploads with the url and fields the intent returned', async () => {
    const gateway = gatewayDouble();
    gateway.pushOnOpen = [transcriptionWith('COMPLETED')];

    await useFileUpload(gateway).upload(AUDIO_FILE, 'es');

    expect(gateway.uploads[0]?.url).toBe(INTENT.upload.url);
    expect(gateway.uploads[0]?.fields).toEqual(PRESIGNED_FIELDS);
    expect(gateway.uploads[0]?.file).toBe(AUDIO_FILE);
  });

  it('publishes the progress the uploader reports', async () => {
    const gateway = gatewayDouble();
    gateway.pushOnOpen = [transcriptionWith('COMPLETED')];
    const seen: number[] = [];
    gateway.onUpload = (upload): Promise<void> => {
      upload.onProgress?.(40);
      seen.push(controller.progress.value);
      upload.onProgress?.(100);
      seen.push(controller.progress.value);
      return Promise.resolve();
    };
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(seen).toEqual([40, 100]);
  });

  /*
   * The push path, and the whole point of the change.
   *
   * Note what is NOT here: a single request for a record. The old flow asked
   * for the user's entire history every three seconds until the record moved —
   * sixty pages fetched to observe one field. That absence is the assertion; a
   * client that opened the socket and then polled anyway would satisfy every
   * other expectation in this test.
   *
   * The one `wait` is the socket budget, started by `Promise.race` alongside
   * the push and abandoned when the push wins. It is asserted rather than
   * tolerated: if a poll schedule ever crept back in, this list would grow.
   */
  it('settles on the pushed record without asking for anything', async () => {
    const gateway = gatewayDouble();
    gateway.pushOnOpen = [transcriptionWith('COMPLETED')];
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('completed');
    expect(controller.transcription.value?.textPreview).toBe('El paciente refiere…');
    expect(gateway.transcriptionRequests).toEqual([]);
    expect(gateway.waits).toEqual([300_000]);
  });

  it('reports a pushed FAILED record as a failed transcription', async () => {
    const gateway = gatewayDouble();
    gateway.pushOnOpen = [transcriptionWith('FAILED')];
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('failed');
    expect(controller.failure.value?.code).toBe('TRANSCRIPTION_FAILED');
  });

  it('closes the socket once the upload it was watching is over', async () => {
    const gateway = gatewayDouble();
    gateway.pushOnOpen = [transcriptionWith('COMPLETED')];
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    // A socket left open belongs to an upload that has finished, and the
    // browser would hold it until API Gateway's two-hour ceiling.
    expect(gateway.streamsOpened).toBe(1);
    expect(gateway.streamsClosed).toBe(1);
  });

  /*
   * The socket carries every transcription this user owns, so a completion
   * belonging to another tab's upload arrives on this one too. Acting on it
   * would report someone else's file as this one — with its file name, its
   * preview and its status.
   */
  it('ignores a pushed record belonging to a different upload', async () => {
    const gateway = gatewayDouble();
    gateway.pushOnOpen = [{ ...transcriptionWith('COMPLETED'), id: 'another-upload' }];
    gateway.records = [transcriptionWith('PROCESSING')];
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    // It fell through to the fallback, which is what "ignored" means here: had
    // it acted on the foreign record it would have settled as completed.
    expect(controller.phase.value).toBe('stillProcessing');
    expect(controller.transcription.value?.id).toBe('t-1');
  });

  /*
   * THE FALLBACK, and the reason it exists at all: a push that silently fails
   * is worse than the polling it replaced, because nothing is left to notice
   * it.
   */
  it('falls back to polling one record when the socket cannot be opened', async () => {
    const gateway = gatewayDouble();
    gateway.socketOpens = false;
    gateway.records = [transcriptionWith('PROCESSING'), transcriptionWith('COMPLETED')];
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('completed');
    // One record by id, never the history, and spaced out rather than every
    // three seconds.
    expect(gateway.transcriptionRequests).toEqual(['t-1', 't-1']);
    expect(gateway.waits).toEqual([15_000, 15_000]);
  });

  it('falls back to polling when the socket opens and then drops', async () => {
    const gateway = gatewayDouble();
    gateway.dropOnOpen = true;
    gateway.records = [transcriptionWith('COMPLETED')];
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('completed');
    expect(gateway.transcriptionRequests).toEqual(['t-1']);
  });

  /*
   * The case nothing else can catch: the socket opens, stays open, and the
   * completion is simply never pushed — a publish that failed on the server,
   * or a connection the service stopped delivering to. Without the budget the
   * client waits for ever on a message that is not coming, and the user sees a
   * spinner with no end.
   */
  it('falls back to polling when the socket opens and stays silent', async () => {
    const gateway = gatewayDouble();
    gateway.records = [transcriptionWith('COMPLETED')];
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('completed');
    // Five minutes on the socket, then the polling schedule.
    expect(gateway.waits).toEqual([300_000, 15_000]);
  });

  /*
   * A loop with no bound is a tab that polls the API all afternoon. The record
   * is not lost when the budget runs out — it is in the history, still being
   * transcribed — so this end state is deliberately not an error.
   */
  it('stops polling after a bounded number of attempts and says the work continues', async () => {
    const gateway = gatewayDouble();
    gateway.socketOpens = false;
    gateway.records = [transcriptionWith('PROCESSING')];
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('stillProcessing');
    expect(controller.failure.value).toBeNull();
    expect(gateway.waits).toHaveLength(8);
    expect(new Set(gateway.waits)).toEqual(new Set([15_000]));
  });

  /*
   * By this point the file is in storage and the record exists. Surfacing a
   * transient read failure as an upload error would tell the user their audio
   * was lost when it was not.
   */
  it('keeps polling through a failed read rather than reporting the upload as broken', async () => {
    const gateway = gatewayDouble();
    gateway.socketOpens = false;
    let attempt = 0;
    gateway.onGetTranscription = (): Promise<Transcription> => {
      attempt += 1;
      if (attempt < 3) {
        return Promise.reject(httpError(503));
      }
      return Promise.resolve(transcriptionWith('COMPLETED'));
    };
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('completed');
  });

  /*
   * The record is written before the upload is acknowledged, so a 404 here is
   * a read that lost a race rather than a record that is missing.
   */
  it('keeps polling while the record is not readable yet', async () => {
    const gateway = gatewayDouble();
    gateway.socketOpens = false;
    let attempt = 0;
    gateway.onGetTranscription = (): Promise<Transcription> => {
      attempt += 1;
      return attempt < 2
        ? Promise.reject(httpError(404))
        : Promise.resolve(transcriptionWith('COMPLETED'));
    };
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('completed');
  });

  it('refuses a format the contract does not name, without calling the API', async () => {
    const gateway = gatewayDouble();
    const controller = useFileUpload(gateway);

    await controller.upload(fileOf('informe.pdf', 'application/pdf', 2048), 'es');

    expect(controller.phase.value).toBe('failed');
    expect(controller.failure.value?.code).toBe('UNSUPPORTED_FORMAT');
    expect(gateway.intentRequests).toHaveLength(0);
  });

  it('refuses a file the browser gave no type at all', async () => {
    const gateway = gatewayDouble();
    const controller = useFileUpload(gateway);

    await controller.upload(fileOf('grabacion', '', 2048), 'es');

    expect(controller.failure.value?.code).toBe('UNSUPPORTED_FORMAT');
    expect(gateway.intentRequests).toHaveLength(0);
  });

  it.each([
    [401, 'SESSION_EXPIRED', 'failure.upload.sessionExpired'],
    [413, 'INTENT_REFUSED', 'failure.upload.tooLarge'],
    [415, 'INTENT_REFUSED', 'failure.upload.unsupportedFormat'],
    [500, 'INTENT_REFUSED', 'failure.upload.refused'],
  ])('turns a %s from the intent call into the failure that fits it', async (status, code, key) => {
    const gateway = gatewayDouble();
    gateway.onCreateIntent = (): Promise<CreateUploadIntentResponse> =>
      Promise.reject(httpError(status));
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('failed');
    expect(controller.failure.value?.code).toBe(code);
    expect(controller.failure.value?.message).toEqual({ key });
    expect(gateway.uploads).toHaveLength(0);
  });

  it('treats an intent failure with no status as a connection problem', async () => {
    const gateway = gatewayDouble();
    gateway.onCreateIntent = (): Promise<CreateUploadIntentResponse> =>
      Promise.reject(new TypeError('Failed to fetch'));
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.failure.value?.code).toBe('NETWORK_FAILED');
  });

  /*
   * The presigned POST policy carries the content-length-range condition, so
   * this is the path a file over 20 MB actually takes when the client-side
   * courtesy check has been bypassed.
   */
  it('surfaces a storage refusal as its own failure, not as a network problem', async () => {
    const gateway = gatewayDouble();
    gateway.onUpload = (): Promise<void> =>
      Promise.reject(new StorageUploadError('REFUSED', { key: 'failure.upload.storageRefused' }));
    const controller = useFileUpload(gateway);

    await controller.upload(fileOf('larga.wav', 'audio/wav', MAX_AUDIO_FILE_SIZE_BYTES + 1), 'es');

    expect(controller.phase.value).toBe('failed');
    expect(controller.failure.value?.code).toBe('STORAGE_REFUSED');
    expect(gateway.waits).toHaveLength(0);
  });

  it('surfaces a dropped upload connection as a network failure', async () => {
    const gateway = gatewayDouble();
    gateway.onUpload = (): Promise<void> =>
      Promise.reject(
        new StorageUploadError('NETWORK_FAILED', { key: 'failure.upload.connectionLost' }),
      );
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.failure.value?.code).toBe('NETWORK_FAILED');
  });

  it('describes an unrecognised upload rejection without inventing a cause', async () => {
    const gateway = gatewayDouble();
    gateway.onUpload = (): Promise<void> => Promise.reject(new Error('boom'));
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.failure.value?.code).toBe('NETWORK_FAILED');
    expect(controller.failure.value?.message).not.toContain('boom');
  });

  it('reports itself busy through the phases where a second upload must not start', async () => {
    const gateway = gatewayDouble();
    gateway.pushOnOpen = [transcriptionWith('COMPLETED')];
    const seen: boolean[] = [];
    gateway.onCreateIntent = (): Promise<CreateUploadIntentResponse> => {
      seen.push(controller.isBusy.value);
      return Promise.resolve(INTENT);
    };
    gateway.onUpload = (): Promise<void> => {
      seen.push(controller.isBusy.value);
      return Promise.resolve();
    };
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(seen).toEqual([true, true]);
    expect(controller.isBusy.value).toBe(false);
  });

  it('clears the previous outcome when a second file is uploaded', async () => {
    const gateway = gatewayDouble();
    gateway.onCreateIntent = (): Promise<CreateUploadIntentResponse> =>
      Promise.reject(httpError(500));
    const controller = useFileUpload(gateway);
    await controller.upload(AUDIO_FILE, 'es');
    expect(controller.failure.value).not.toBeNull();

    gateway.onCreateIntent = (): Promise<CreateUploadIntentResponse> => Promise.resolve(INTENT);
    gateway.pushOnOpen = [transcriptionWith('COMPLETED')];
    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.failure.value).toBeNull();
    expect(controller.phase.value).toBe('completed');
  });

  it('returns to idle when reset', async () => {
    const gateway = gatewayDouble();
    gateway.pushOnOpen = [transcriptionWith('COMPLETED')];
    const controller = useFileUpload(gateway);
    await controller.upload(AUDIO_FILE, 'es');

    controller.reset();

    expect(controller.phase.value).toBe('idle');
    expect(controller.transcription.value).toBeNull();
    expect(controller.progress.value).toBe(0);
  });
});
