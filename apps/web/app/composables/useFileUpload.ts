import {
  CreateUploadIntentResponseSchema,
  ListTranscriptionsResponseSchema,
  SUPPORTED_AUDIO_CONTENT_TYPES,
} from '@vocali/contracts';
import type {
  CreateUploadIntentRequest,
  CreateUploadIntentResponse,
  ListTranscriptionsResponse,
  Transcription,
  TranscriptionLanguage,
} from '@vocali/contracts';
import { computed, readonly, ref } from 'vue';
import type { ComputedRef, DeepReadonly, Ref } from 'vue';
import { TRANSCRIPTIONS_PATH, UPLOADS_PATH } from '../utils/api-routes';
import { readStatusCode } from '../utils/http-failure';
import {
  HTTP_FORBIDDEN,
  HTTP_MULTIPLE_CHOICES,
  HTTP_OK,
  HTTP_PAYLOAD_TOO_LARGE,
  HTTP_UNAUTHORIZED,
  HTTP_UNSUPPORTED_MEDIA_TYPE,
} from '../utils/http-status';

/**
 * Uploading an audio file and following it until it has been transcribed.
 *
 * Nothing here reaches the network itself. Every call is a collaborator on
 * `FileUploadGateway`, supplied by the page, which is the only place `$fetch`
 * appears. Two reasons, and the second is the load-bearing one:
 *
 *  - the flow below is a state machine with four failure exits, and pinning
 *    those exits means driving it, not stubbing a global;
 *  - Jest compiles this file with the package's own tsconfig, which carries no
 *    Nuxt types. A bare `$fetch` anywhere in the source fails to compile under
 *    test whether or not any test calls it — the reference only has to exist.
 */

/** The percentage denominator, named so the arithmetic below reads as intent. */
const PERCENT = 100;

/**
 * Three seconds apart, twenty times: a minute of watching.
 *
 * The bound matters more than the numbers. Transcription is asynchronous and a
 * long file can outlast any interval worth choosing, so a loop without a limit
 * is a tab that polls the API forever while its owner is at lunch. When the
 * budget runs out the record is not lost — it is in the history, still being
 * transcribed — so the honest end state says exactly that rather than an
 * error.
 */
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20;

export type FileUploadPhase =
  | 'idle'
  | 'requesting'
  | 'uploading'
  | 'processing'
  /** Transcribed and stored. */
  | 'completed'
  /** The attempt ended badly; `failure` says how. */
  | 'failed'
  /**
   * Uploaded and accepted, but still being transcribed when the watch budget
   * ran out. Distinct from `failed` because nothing went wrong.
   */
  | 'stillProcessing';

export type FileUploadFailureCode =
  | 'SESSION_EXPIRED'
  | 'UNSUPPORTED_FORMAT'
  | 'INTENT_REFUSED'
  | 'STORAGE_REFUSED'
  | 'NETWORK_FAILED'
  | 'TRANSCRIPTION_FAILED';

export interface FileUploadFailure {
  readonly code: FileUploadFailureCode;
  /** Spanish, and phrased so it says what to do next. */
  readonly message: string;
}

export interface PresignedPostUpload {
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly file: File;
  readonly onProgress?: (percentage: number) => void;
}

export type StorageUploadFailureCode = 'REFUSED' | 'NETWORK_FAILED' | 'ABORTED';

export class StorageUploadError extends Error {
  public readonly code: StorageUploadFailureCode;

  constructor(code: StorageUploadFailureCode, message: string) {
    super(message);
    this.name = 'StorageUploadError';
    this.code = code;
  }
}

/**
 * Assembles the multipart body of a presigned POST.
 *
 * **The policy fields must precede the file, and that is the entire reason
 * this function exists rather than three lines at the call site.** S3 parses
 * the multipart body in order and stops collecting form fields the moment it
 * reaches the file part; anything after it is ignored. A body that puts the
 * file first therefore arrives with no policy, no signature and no key, and
 * S3 answers with a policy error that names none of that. The upload simply
 * fails, at the end of however long the file took to send, for a reason the
 * response does not state.
 *
 * `file` is the part name the presigned POST contract requires; it is not a
 * choice.
 */
export function buildPresignedPostForm(
  fields: Readonly<Record<string, string>>,
  file: File,
): FormData {
  const form = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }

  form.append('file', file, file.name);

  return form;
}

function describeStorageRefusal(status: number): string {
  if (status === HTTP_FORBIDDEN) {
    return (
      'El almacenamiento ha rechazado el archivo: el permiso de subida ha caducado o el archivo ' +
      'no cumple la política de tamaño. Vuelve a intentarlo con un archivo de menos de 20 MB.'
    );
  }
  return 'El almacenamiento no ha aceptado el archivo. Inténtalo de nuevo en unos segundos.';
}

/**
 * POSTs the file straight to S3, reporting how much of it has been sent.
 *
 * `XMLHttpRequest` rather than `fetch` for one reason: `fetch` cannot report
 * upload progress at all. It exposes a stream for the response and nothing for
 * the request, so a `fetch`-based upload can only show a bar that moves on a
 * timer — which tells the user something the code does not know. On a 20 MB
 * file over a clinic's connection that difference is a minute of either
 * genuine feedback or a fiction.
 */
export function uploadToPresignedPost(
  upload: PresignedPostUpload,
  createRequest: () => XMLHttpRequest = (): XMLHttpRequest => new XMLHttpRequest(),
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = createRequest();
    request.open('POST', upload.url);

    request.upload.addEventListener('progress', (event: ProgressEvent) => {
      // `total` is 0 until the request has a length, so the first event of
      // every upload would otherwise divide by zero and report NaN.
      if (!event.lengthComputable || event.total === 0) {
        return;
      }
      upload.onProgress?.((event.loaded / event.total) * PERCENT);
    });

    request.addEventListener('load', () => {
      if (request.status >= HTTP_OK && request.status < HTTP_MULTIPLE_CHOICES) {
        // The last progress event can arrive a little short of the total, and
        // a bar frozen at 98% next to a finished upload reads as a hang.
        upload.onProgress?.(PERCENT);
        resolve();
        return;
      }
      reject(new StorageUploadError('REFUSED', describeStorageRefusal(request.status)));
    });

    request.addEventListener('error', () => {
      reject(
        new StorageUploadError(
          'NETWORK_FAILED',
          'Se ha perdido la conexión mientras se subía el archivo. Comprueba tu red y vuelve a intentarlo.',
        ),
      );
    });

    request.addEventListener('timeout', () => {
      reject(
        new StorageUploadError(
          'NETWORK_FAILED',
          'La subida ha tardado demasiado y se ha interrumpido. Vuelve a intentarlo.',
        ),
      );
    });

    request.addEventListener('abort', () => {
      reject(new StorageUploadError('ABORTED', 'Has cancelado la subida.'));
    });

    request.send(buildPresignedPostForm(upload.fields, upload.file));
  });
}

function describeIntentFailure(error: unknown): FileUploadFailure {
  const status = readStatusCode(error);

  if (status === HTTP_UNAUTHORIZED) {
    return {
      code: 'SESSION_EXPIRED',
      message: 'Tu sesión ha caducado. Vuelve a iniciar sesión para subir el archivo.',
    };
  }
  if (status === HTTP_PAYLOAD_TOO_LARGE) {
    return {
      code: 'INTENT_REFUSED',
      message: 'El archivo supera el límite de 20 MB, así que no se ha aceptado.',
    };
  }
  if (status === HTTP_UNSUPPORTED_MEDIA_TYPE) {
    return {
      code: 'INTENT_REFUSED',
      message: 'El formato del archivo no es compatible, así que no se ha aceptado.',
    };
  }
  if (status !== null) {
    return {
      code: 'INTENT_REFUSED',
      message: 'No se ha podido preparar la subida. Revisa el archivo y vuelve a intentarlo.',
    };
  }
  return {
    code: 'NETWORK_FAILED',
    message: 'No se ha podido contactar con el servidor. Comprueba tu conexión y reinténtalo.',
  };
}

function describeUploadFailure(error: unknown): FileUploadFailure {
  if (error instanceof StorageUploadError) {
    return {
      code: error.code === 'REFUSED' ? 'STORAGE_REFUSED' : 'NETWORK_FAILED',
      message: error.message,
    };
  }
  return {
    code: 'NETWORK_FAILED',
    message: 'La subida ha fallado por un motivo inesperado. Vuelve a intentarlo.',
  };
}

export interface FileUploadGateway {
  createUploadIntent(request: CreateUploadIntentRequest): Promise<CreateUploadIntentResponse>;
  uploadToStorage(upload: PresignedPostUpload): Promise<void>;
  /**
   * The first page of the history, newest first, which is where a
   * just-uploaded record is. Nothing here reads `nextCursor`: a record that
   * has fallen off the first page was overtaken by ten newer ones, and at that
   * point the history screen is the right place to look at it.
   */
  listTranscriptions(): Promise<ListTranscriptionsResponse>;
  /** Injected so the polling schedule is something a test advances, not waits out. */
  wait(milliseconds: number): Promise<void>;
}

export interface ApiRequestOptions {
  readonly method: 'GET' | 'POST';
  readonly body?: Record<string, unknown>;
}

/**
 * A call to the BFF proxy, narrowed to what this front end actually makes.
 *
 * The page passes `$fetch` in through this. Keeping the type here rather than
 * naming ofetch's own means nothing below the page mentions Nuxt — which is
 * not stylistic: ts-jest compiles these files against a tsconfig with no Nuxt
 * types, and a bare `$fetch` anywhere in the source fails to compile under
 * test whether or not a test reaches it.
 */
export type ApiRequester = (path: string, options: ApiRequestOptions) => Promise<unknown>;

/**
 * The two API calls the upload flow makes, bound to their paths.
 *
 * Separated from the page so the paths and the response validation are
 * exercised by the test suite. A path spelled wrong is a 404 that appears only
 * on a deployed environment, and a page is the one layer Jest never mounts.
 *
 * The paths come from `utils/api-routes`, which is where every path this front
 * end calls is written down: `POST /uploads` and `GET /transcriptions` as the
 * API serves them, with `/api` prefixed for the proxy.
 */
export function createUploadRequests(
  request: ApiRequester,
): Pick<FileUploadGateway, 'createUploadIntent' | 'listTranscriptions'> {
  return {
    async createUploadIntent(
      intent: CreateUploadIntentRequest,
    ): Promise<CreateUploadIntentResponse> {
      const response = await request(UPLOADS_PATH, { method: 'POST', body: { ...intent } });
      /*
       * Parsed, not asserted. A type argument on the request tells the
       * compiler what to assume and checks nothing at run time; this is data
       * crossing into the browser, so a shape the contract does not promise
       * fails here rather than as an undefined property inside the upload.
       */
      return CreateUploadIntentResponseSchema.parse(response);
    },

    async listTranscriptions(): Promise<ListTranscriptionsResponse> {
      const response = await request(TRANSCRIPTIONS_PATH, { method: 'GET' });
      return ListTranscriptionsResponseSchema.parse(response);
    },
  };
}

export interface FileUploadController {
  readonly phase: DeepReadonly<Ref<FileUploadPhase>>;
  readonly progress: DeepReadonly<Ref<number>>;
  readonly failure: DeepReadonly<Ref<FileUploadFailure | null>>;
  readonly transcription: DeepReadonly<Ref<Transcription | null>>;
  readonly isBusy: ComputedRef<boolean>;
  /*
   * Declared as properties holding functions rather than as methods, because
   * that is what they are: closures over the state above, with no `this`. A
   * method signature would promise a receiver they do not have, and a page
   * that destructures them off the controller — which is the natural way to
   * use it — would be doing something the type says is unsafe.
   */
  readonly upload: (file: File, language: TranscriptionLanguage) => Promise<void>;
  readonly reset: () => void;
}

type SupportedContentType = CreateUploadIntentRequest['contentType'];

/**
 * Narrows the browser's reported MIME type to one the contract names.
 *
 * A search rather than a cast. `File.type` is whatever the operating system
 * told the browser — it can be empty, or a type nobody supports — and
 * asserting it into the contract's union would push an invalid request to the
 * API and get back a validation error with no useful words in it.
 */
function supportedContentTypeOf(file: File): SupportedContentType | null {
  return SUPPORTED_AUDIO_CONTENT_TYPES.find((type) => type === file.type) ?? null;
}

export function useFileUpload(gateway: FileUploadGateway): FileUploadController {
  const phase = ref<FileUploadPhase>('idle');
  const progress = ref(0);
  const failure = ref<FileUploadFailure | null>(null);
  const transcription = ref<Transcription | null>(null);

  const isBusy = computed<boolean>(
    () =>
      phase.value === 'requesting' || phase.value === 'uploading' || phase.value === 'processing',
  );

  function fail(reason: FileUploadFailure): void {
    failure.value = reason;
    phase.value = 'failed';
  }

  function reset(): void {
    phase.value = 'idle';
    progress.value = 0;
    failure.value = null;
    transcription.value = null;
  }

  /**
   * Watches the record until it settles, or until the budget runs out.
   *
   * A failed poll is swallowed and retried rather than surfaced. By this point
   * the file is in storage and the record exists; a transient list failure
   * means the watching broke, not the upload, and reporting it as an upload
   * error would tell the user their audio was lost when it was not.
   */
  async function watchUntilSettled(transcriptionId: string): Promise<void> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      await gateway.wait(POLL_INTERVAL_MS);

      let page: ListTranscriptionsResponse;
      try {
        page = await gateway.listTranscriptions();
      } catch {
        continue;
      }

      const record = page.items.find((item) => item.id === transcriptionId);
      if (record === undefined) {
        continue;
      }
      transcription.value = record;

      if (record.status === 'COMPLETED') {
        phase.value = 'completed';
        return;
      }
      if (record.status === 'FAILED') {
        fail({
          code: 'TRANSCRIPTION_FAILED',
          message:
            'No se ha podido transcribir el archivo. Comprueba que el audio se oye con claridad y vuelve a intentarlo.',
        });
        return;
      }
    }

    phase.value = 'stillProcessing';
  }

  async function upload(file: File, language: TranscriptionLanguage): Promise<void> {
    reset();

    const contentType = supportedContentTypeOf(file);
    if (contentType === null) {
      fail({
        code: 'UNSUPPORTED_FORMAT',
        message: `No reconocemos el formato de «${file.name}», así que no podemos transcribirlo.`,
      });
      return;
    }

    phase.value = 'requesting';

    let intent: CreateUploadIntentResponse;
    try {
      intent = await gateway.createUploadIntent({
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
        language,
      });
    } catch (error: unknown) {
      fail(describeIntentFailure(error));
      return;
    }

    phase.value = 'uploading';
    try {
      await gateway.uploadToStorage({
        url: intent.upload.url,
        fields: intent.upload.fields,
        file,
        onProgress: (percentage: number) => {
          progress.value = percentage;
        },
      });
    } catch (error: unknown) {
      fail(describeUploadFailure(error));
      return;
    }

    phase.value = 'processing';
    await watchUntilSettled(intent.transcriptionId);
  }

  return {
    phase: readonly(phase),
    progress: readonly(progress),
    failure: readonly(failure),
    transcription: readonly(transcription),
    isBusy,
    upload,
    reset,
  };
}
