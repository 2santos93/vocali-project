import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import type {
  CreateUploadIntentRequest,
  CreateUploadIntentResponse,
  ListTranscriptionsResponse,
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

function pageOf(...items: Transcription[]): ListTranscriptionsResponse {
  return { items, nextCursor: null };
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
  listPages: ListTranscriptionsResponse[];
  onCreateIntent: () => Promise<CreateUploadIntentResponse>;
  onUpload: (upload: PresignedPostUpload) => Promise<void>;
  onList: (() => Promise<ListTranscriptionsResponse>) | null;
}

function gatewayDouble(): GatewayDouble {
  const intentRequests: CreateUploadIntentRequest[] = [];
  const uploads: PresignedPostUpload[] = [];
  const waits: number[] = [];

  const gateway: GatewayDouble = {
    intentRequests,
    uploads,
    waits,
    listPages: [],
    onCreateIntent: () => Promise.resolve(INTENT),
    onUpload: () => Promise.resolve(),
    onList: null,

    createUploadIntent(request: CreateUploadIntentRequest): Promise<CreateUploadIntentResponse> {
      intentRequests.push(request);
      return gateway.onCreateIntent();
    },
    uploadToStorage(upload: PresignedPostUpload): Promise<void> {
      uploads.push(upload);
      return gateway.onUpload(upload);
    },
    listTranscriptions(): Promise<ListTranscriptionsResponse> {
      if (gateway.onList !== null) {
        return gateway.onList();
      }
      // The last page keeps being returned once the script runs out, so a
      // test only has to describe the transitions it cares about.
      const next = gateway.listPages.length > 1 ? gateway.listPages.shift() : gateway.listPages[0];
      return Promise.resolve(next ?? pageOf());
    },
    // Resolved immediately: the schedule is asserted through `waits`, so the
    // suite never spends the sixty seconds the real polling budget allows.
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
      expect((error as StorageUploadError).message).toContain('20 MB');
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

    await expect(settled).rejects.toThrow('El almacenamiento no ha aceptado el archivo');
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

  it.each([
    ['error', 'NETWORK_FAILED', 'Se ha perdido la conexión'],
    ['timeout', 'NETWORK_FAILED', 'ha tardado demasiado'],
    ['abort', 'ABORTED', 'Has cancelado'],
  ])('reports a transport %s in Spanish', async (event, code, fragment) => {
    const double = requestDouble();
    const settled = uploadToPresignedPost(
      { url: INTENT.upload.url, fields: PRESIGNED_FIELDS, file: AUDIO_FILE },
      () => double.request,
    );

    double.emit(event);

    await settled.catch((error: unknown) => {
      expect((error as StorageUploadError).code).toBe(code);
      expect((error as StorageUploadError).message).toContain(fragment);
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

  it('reads the history from GET /api/transcriptions', async () => {
    const { request, calls } = requesterReturning(pageOf(transcriptionWith('COMPLETED')));

    await createUploadRequests(request).listTranscriptions();

    expect(calls).toEqual([{ path: '/api/transcriptions', options: { method: 'GET' } }]);
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

  it('refuses a history page the contract does not describe', async () => {
    const { request } = requesterReturning({ items: [{ id: 't-1' }], nextCursor: null });

    await expect(createUploadRequests(request).listTranscriptions()).rejects.toThrow();
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
    gateway.listPages = [pageOf(transcriptionWith('COMPLETED'))];

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
    gateway.listPages = [pageOf(transcriptionWith('COMPLETED'))];

    await useFileUpload(gateway).upload(AUDIO_FILE, 'es');

    expect(gateway.uploads[0]?.url).toBe(INTENT.upload.url);
    expect(gateway.uploads[0]?.fields).toEqual(PRESIGNED_FIELDS);
    expect(gateway.uploads[0]?.file).toBe(AUDIO_FILE);
  });

  it('publishes the progress the uploader reports', async () => {
    const gateway = gatewayDouble();
    gateway.listPages = [pageOf(transcriptionWith('COMPLETED'))];
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

  it('settles on completed once the record leaves PROCESSING', async () => {
    const gateway = gatewayDouble();
    gateway.listPages = [
      pageOf(transcriptionWith('PROCESSING')),
      pageOf(transcriptionWith('PROCESSING')),
      pageOf(transcriptionWith('COMPLETED')),
    ];
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('completed');
    expect(controller.transcription.value?.textPreview).toBe('El paciente refiere…');
    expect(gateway.waits).toHaveLength(3);
  });

  it('reports a record that came back FAILED as a failed transcription', async () => {
    const gateway = gatewayDouble();
    gateway.listPages = [pageOf(transcriptionWith('FAILED'))];
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('failed');
    expect(controller.failure.value?.code).toBe('TRANSCRIPTION_FAILED');
  });

  /*
   * A loop with no bound is a tab that polls the API all afternoon. The record
   * is not lost when the budget runs out — it is in the history, still being
   * transcribed — so this end state is deliberately not an error.
   */
  it('stops watching after a bounded number of attempts and says the work continues', async () => {
    const gateway = gatewayDouble();
    gateway.listPages = [pageOf(transcriptionWith('PROCESSING'))];
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('stillProcessing');
    expect(controller.failure.value).toBeNull();
    expect(gateway.waits).toHaveLength(20);
    expect(new Set(gateway.waits)).toEqual(new Set([3000]));
  });

  /*
   * By this point the file is in storage and the record exists. Surfacing a
   * transient list failure as an upload error would tell the user their audio
   * was lost when it was not.
   */
  it('keeps watching through a failed poll rather than reporting the upload as broken', async () => {
    const gateway = gatewayDouble();
    let attempt = 0;
    gateway.onList = (): Promise<ListTranscriptionsResponse> => {
      attempt += 1;
      if (attempt < 3) {
        return Promise.reject(httpError(503));
      }
      return Promise.resolve(pageOf(transcriptionWith('COMPLETED')));
    };
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('completed');
  });

  it('keeps watching while the record has not reached the first page yet', async () => {
    const gateway = gatewayDouble();
    gateway.listPages = [pageOf(), pageOf(transcriptionWith('COMPLETED'))];
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
    [401, 'SESSION_EXPIRED', 'Tu sesión ha caducado'],
    [413, 'INTENT_REFUSED', '20 MB'],
    [415, 'INTENT_REFUSED', 'formato'],
    [500, 'INTENT_REFUSED', 'No se ha podido preparar la subida'],
  ])('translates a %s from the intent call into Spanish', async (status, code, fragment) => {
    const gateway = gatewayDouble();
    gateway.onCreateIntent = (): Promise<CreateUploadIntentResponse> =>
      Promise.reject(httpError(status));
    const controller = useFileUpload(gateway);

    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.phase.value).toBe('failed');
    expect(controller.failure.value?.code).toBe(code);
    expect(controller.failure.value?.message).toContain(fragment);
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
      Promise.reject(
        new StorageUploadError('REFUSED', 'El almacenamiento ha rechazado el archivo'),
      );
    const controller = useFileUpload(gateway);

    await controller.upload(fileOf('larga.wav', 'audio/wav', MAX_AUDIO_FILE_SIZE_BYTES + 1), 'es');

    expect(controller.phase.value).toBe('failed');
    expect(controller.failure.value?.code).toBe('STORAGE_REFUSED');
    expect(gateway.waits).toHaveLength(0);
  });

  it('surfaces a dropped upload connection as a network failure', async () => {
    const gateway = gatewayDouble();
    gateway.onUpload = (): Promise<void> =>
      Promise.reject(new StorageUploadError('NETWORK_FAILED', 'Se ha perdido la conexión'));
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
    gateway.listPages = [pageOf(transcriptionWith('COMPLETED'))];
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
    gateway.listPages = [pageOf(transcriptionWith('COMPLETED'))];
    await controller.upload(AUDIO_FILE, 'es');

    expect(controller.failure.value).toBeNull();
    expect(controller.phase.value).toBe('completed');
  });

  it('returns to idle when reset', async () => {
    const gateway = gatewayDouble();
    gateway.listPages = [pageOf(transcriptionWith('COMPLETED'))];
    const controller = useFileUpload(gateway);
    await controller.upload(AUDIO_FILE, 'es');

    controller.reset();

    expect(controller.phase.value).toBe('idle');
    expect(controller.transcription.value).toBeNull();
    expect(controller.progress.value).toBe(0);
  });
});
