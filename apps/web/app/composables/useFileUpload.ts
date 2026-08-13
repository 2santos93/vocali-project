import {
  CreateUploadIntentResponseSchema,
  SUPPORTED_AUDIO_CONTENT_TYPES,
  TranscriptionSchema,
} from '@vocali/contracts';
import type {
  CreateUploadIntentRequest,
  CreateUploadIntentResponse,
  Transcription,
  TranscriptionLanguage,
} from '@vocali/contracts';
import { computed, readonly, ref } from 'vue';
import type { ComputedRef, DeepReadonly, Ref } from 'vue';
import type { TranslatableMessage } from '../i18n/translate';
import { transcriptionPath, UPLOADS_PATH } from '../utils/api-routes';
import { createUpdateStreamOpener } from './useTranscriptionUpdates';
import type {
  SocketFactory,
  TranscriptionUpdateStream,
  UpdateStreamOpener,
} from './useTranscriptionUpdates';
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
 * How long to wait on the socket before deciding the push is not coming.
 *
 * Five minutes, and waiting costs nothing: while the socket is open this makes
 * no requests at all, so the only reason to bound it is the failure this whole
 * design has to answer for — **a push that silently fails is worse than the
 * polling it replaced, because nothing is left to notice it.** If the server
 * never publishes, or publishes to a connection that quietly stopped
 * delivering, this is what notices.
 *
 * Long enough that an ordinary transcription of a twenty-megabyte file settles
 * well inside it, so the fallback below is genuinely a fallback rather than
 * the common path.
 */
const PUSH_WATCH_BUDGET_MS = 300_000;

/**
 * The fallback, and deliberately unlike the loop it replaced.
 *
 * That loop asked for the whole first page of the history every three seconds,
 * twenty times — sixty pages fetched to watch one field, and a record overtaken
 * by ten newer uploads dropped off the page it was searching. This asks for the
 * one record, and asks eight times at fifteen seconds: eight requests against
 * sixty, over two minutes rather than one.
 *
 * The bound still matters more than the numbers. A long file can outlast any
 * interval worth choosing, so a loop without a limit is a tab polling the API
 * while its owner is at lunch. When the budget runs out the record is not lost
 * — it is in the history, still being transcribed — so the honest end state
 * says exactly that rather than an error.
 */
const FALLBACK_POLL_INTERVAL_MS = 15_000;
const MAX_FALLBACK_POLL_ATTEMPTS = 8;

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
  readonly message: TranslatableMessage;
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

  /**
   * What the reader is told. `Error.message` is a string by construction and a
   * developer reads it in a stack trace, so it carries the key; the sentence
   * is produced from `detail` at the moment it is rendered.
   */
  public readonly detail: TranslatableMessage;

  constructor(code: StorageUploadFailureCode, detail: TranslatableMessage) {
    super(detail.key);
    this.name = 'StorageUploadError';
    this.code = code;
    this.detail = detail;
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

function describeStorageRefusal(status: number): TranslatableMessage {
  if (status === HTTP_FORBIDDEN) {
    return { key: 'failure.upload.storageRefused' };
  }
  return { key: 'failure.upload.storageUnavailable' };
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
      reject(new StorageUploadError('NETWORK_FAILED', { key: 'failure.upload.connectionLost' }));
    });

    request.addEventListener('timeout', () => {
      reject(new StorageUploadError('NETWORK_FAILED', { key: 'failure.upload.timedOut' }));
    });

    request.addEventListener('abort', () => {
      reject(new StorageUploadError('ABORTED', { key: 'failure.upload.aborted' }));
    });

    request.send(buildPresignedPostForm(upload.fields, upload.file));
  });
}

function describeIntentFailure(error: unknown): FileUploadFailure {
  const status = readStatusCode(error);

  if (status === HTTP_UNAUTHORIZED) {
    return {
      code: 'SESSION_EXPIRED',
      message: { key: 'failure.upload.sessionExpired' },
    };
  }
  if (status === HTTP_PAYLOAD_TOO_LARGE) {
    return {
      code: 'INTENT_REFUSED',
      message: { key: 'failure.upload.tooLarge' },
    };
  }
  if (status === HTTP_UNSUPPORTED_MEDIA_TYPE) {
    return {
      code: 'INTENT_REFUSED',
      message: { key: 'failure.upload.unsupportedFormat' },
    };
  }
  if (status !== null) {
    return {
      code: 'INTENT_REFUSED',
      message: { key: 'failure.upload.refused' },
    };
  }
  return {
    code: 'NETWORK_FAILED',
    message: { key: 'failure.upload.unreachable' },
  };
}

function describeUploadFailure(error: unknown): FileUploadFailure {
  if (error instanceof StorageUploadError) {
    return {
      code: error.code === 'REFUSED' ? 'STORAGE_REFUSED' : 'NETWORK_FAILED',
      message: error.detail,
    };
  }
  return {
    code: 'NETWORK_FAILED',
    message: { key: 'failure.upload.unexpected' },
  };
}

export interface FileUploadGateway {
  createUploadIntent(request: CreateUploadIntentRequest): Promise<CreateUploadIntentResponse>;
  uploadToStorage(upload: PresignedPostUpload): Promise<void>;
  /**
   * Opens the socket the API pushes settled transcriptions down, and rejects
   * if it cannot be opened. This is the normal path; everything below it is
   * what happens when it does not work.
   */
  openUpdateStream: UpdateStreamOpener;
  /** One record by id — the fallback's request, and only the fallback's. */
  getTranscription(transcriptionId: string): Promise<Transcription>;
  /** Injected so the schedule is something a test advances, not waits out. */
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
  createSocket?: SocketFactory,
): Pick<FileUploadGateway, 'createUploadIntent' | 'getTranscription' | 'openUpdateStream'> {
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

    async getTranscription(transcriptionId: string): Promise<Transcription> {
      const response = await request(transcriptionPath(transcriptionId), { method: 'GET' });
      return TranscriptionSchema.parse(response);
    },

    /*
     * The socket factory is optional so the page's existing call still
     * compiles: it passes `$fetch` and nothing else, and the default is the
     * browser's own `WebSocket`. Injectable at all because a test cannot open
     * one.
     */
    openUpdateStream: createUpdateStreamOpener(request, createSocket),
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

interface Settlement<T> {
  readonly settled: Promise<T>;
  readonly settle: (value: T) => void;
}

/**
 * A promise settled from outside itself.
 *
 * The socket watch needs one because the thing that resolves it is an event
 * handler registered before the waiting starts, and there is no way to express
 * that with `new Promise` alone without nesting the whole watch inside an
 * executor.
 *
 * Settling twice is a no-op, which matters here: a push arriving in the same
 * turn as a close would otherwise be a race about which value won.
 */
function createSettlement<T>(): Settlement<T> {
  let settle: ((value: T) => void) | undefined;

  const settled = new Promise<T>((resolve) => {
    settle = resolve;
  });

  if (settle === undefined) {
    // Unreachable: a promise executor runs synchronously, so the assignment
    // above has already happened. Stated rather than asserted away, because
    // the alternative is a non-null assertion that would also be silent if
    // that ever stopped being true.
    throw new Error('Promise executor did not run synchronously');
  }

  return { settled, settle };
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
   * Records a settled transcription and reports it, or says it is not settled
   * yet.
   *
   * One function for both the pushed record and the polled one, because they
   * are the same record arriving by different routes and the two must not
   * drift into disagreeing about what "finished" means or what the user is
   * told when it failed.
   */
  function applySettled(record: Transcription): boolean {
    transcription.value = record;

    if (record.status === 'COMPLETED') {
      phase.value = 'completed';
      return true;
    }
    if (record.status === 'FAILED') {
      fail({
        code: 'TRANSCRIPTION_FAILED',
        message: { key: 'failure.upload.transcriptionFailed' },
      });
      return true;
    }

    return false;
  }

  /**
   * Waits for the server to push the outcome.
   *
   * Returns true when it did, and false for every way it might not have: the
   * socket could not be opened, it dropped, or it stayed open and silent for
   * longer than the budget. The caller does the same thing in all three cases,
   * and collapsing them here is deliberate — a client that distinguished them
   * would be reporting the transport to a user who only asked to transcribe a
   * file.
   */
  async function watchThroughSocket(transcriptionId: string): Promise<boolean> {
    const settlement = createSettlement<boolean>();

    let stream: TranscriptionUpdateStream;
    try {
      stream = await gateway.openUpdateStream({
        onTranscription(record: Transcription) {
          // The socket carries every transcription this user owns, so a
          // completion belonging to another tab's upload arrives here too.
          // Acting on it would report someone else's file as this one.
          if (record.id !== transcriptionId) return;
          if (applySettled(record)) {
            settlement.settle(true);
          }
        },
        onClosed() {
          settlement.settle(false);
        },
      });
    } catch {
      // No stream, so nothing to close. The caller polls.
      return false;
    }

    try {
      return await Promise.race([
        settlement.settled,
        // The one place the silent-failure case is caught. `wait` is injected,
        // so this is something a test advances rather than five minutes it has
        // to sit through.
        //
        // `race` starts both, so a push that arrives first leaves this timer
        // pending and abandoned — it fires five minutes later and resolves a
        // promise nobody is awaiting. Stated rather than worked around: `wait`
        // has no cancellation to offer, adding one would put an abort
        // mechanism in the gateway for this single caller, and one dangling
        // timer per upload is not the same order of cost as the sixty history
        // requests this replaced. The page holds the outstanding handle and
        // clears it when the component unmounts.
        gateway.wait(PUSH_WATCH_BUDGET_MS).then(() => false),
      ]);
    } finally {
      // Closed on every exit, including the one where the push arrived: a
      // socket left open belongs to an upload that is over, and the browser
      // would hold it until API Gateway's two-hour ceiling.
      stream.close();
    }
  }

  /**
   * Asks for the one record, on a slow schedule, until it settles or the
   * budget runs out.
   *
   * A failed request is swallowed and retried rather than surfaced. By this
   * point the file is in storage and the record exists; a transient read
   * failure means the watching broke, not the upload, and reporting it as an
   * upload error would tell the user their audio was lost when it was not. A
   * 404 is the same: the record is written before the upload is acknowledged,
   * so this is a read that lost a race, not a record that is missing.
   */
  async function pollUntilSettled(transcriptionId: string): Promise<void> {
    for (let attempt = 0; attempt < MAX_FALLBACK_POLL_ATTEMPTS; attempt += 1) {
      await gateway.wait(FALLBACK_POLL_INTERVAL_MS);

      let record: Transcription;
      try {
        record = await gateway.getTranscription(transcriptionId);
      } catch {
        continue;
      }

      if (applySettled(record)) return;
    }

    phase.value = 'stillProcessing';
  }

  /**
   * Watches the record until it settles: the socket first, polling only if
   * that did not deliver.
   *
   * The order is the whole change. The old flow asked the API for the user's
   * entire history every three seconds until the record moved, which is sixty
   * requests to observe one field and was visible to anyone who opened the
   * network tab.
   */
  async function watchUntilSettled(transcriptionId: string): Promise<void> {
    if (await watchThroughSocket(transcriptionId)) return;

    await pollUntilSettled(transcriptionId);
  }

  async function upload(file: File, language: TranscriptionLanguage): Promise<void> {
    reset();

    const contentType = supportedContentTypeOf(file);
    if (contentType === null) {
      fail({
        code: 'UNSUPPORTED_FORMAT',
        message: { key: 'failure.upload.unknownFormat', values: { fileName: file.name } },
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
