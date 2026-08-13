import {
  CreateUploadIntentResponseSchema,
  SUPPORTED_AUDIO_CONTENT_TYPES,
  TranscriptionSchema,
} from '@vocali/contracts';
import type {
  CreateUploadIntentRequest,
  CreateUploadIntentResponse,
  Transcription,
} from '@vocali/contracts';
import { computed, readonly, ref } from 'vue';
import type { ComputedRef, DeepReadonly, Ref } from 'vue';
import type { ApiRequester } from '../utils/api-request';
import { transcriptionPath, UPLOADS_PATH } from '../utils/api-routes';
import type { PresignedPostUpload } from './presigned-post-upload';
import { watchUntilSettled } from './settlement-watch';
import type { SettlementWatchGateway } from './settlement-watch';
import {
  describeIntentFailure,
  describeUnsupportedFormat,
  describeUploadFailure,
  TRANSCRIPTION_FAILED,
} from './upload-failures';
import type { FileUploadFailure, FileUploadPhase } from './upload-failures';
import { createUpdateStreamOpener } from './useTranscriptionUpdates';
import type { SocketFactory } from './useTranscriptionUpdates';

/**
 * Uploading an audio file and following it until it has been transcribed.
 *
 * Nothing here reaches the network itself. Every call is a collaborator on
 * `FileUploadGateway`, supplied by the page, which is the only place `$fetch`
 * appears. The reason is the flow below: a state machine with four failure
 * exits, and pinning those exits means driving it, not stubbing a global.
 *
 * Nothing enforces it. This file could name `$fetch` and both gates would pass
 * — ts-jest type checks nothing in this configuration, and `tsconfig.app.json`
 * grants composables the Nuxt types because composables are allowed the
 * runtime. The cost would be paid at run time, in whichever test reached the
 * line, which is a far weaker guarantee than the one this comment used to
 * claim.
 *
 * Three collaborators carry the rest. The transfer to the bucket is in
 * `presigned-post-upload`, where S3's contract lives; finding out that the
 * transcription finished is in `settlement-watch`; and what the user is told
 * when any of it fails is in `upload-failures`, which also holds the phase and
 * failure vocabulary this flow moves through. What remains is driving it:
 * which phase the upload is in and the order the steps happen in.
 */

/**
 * Extends what the settle watch needs rather than restating it, so the two
 * cannot drift: the page supplies one object and both halves read from it.
 */
export interface FileUploadGateway extends SettlementWatchGateway {
  createUploadIntent(request: CreateUploadIntentRequest): Promise<CreateUploadIntentResponse>;
  uploadToStorage(upload: PresignedPostUpload): Promise<void>;
}

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
  readonly upload: (file: File) => Promise<void>;
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
      fail(TRANSCRIPTION_FAILED);
      return true;
    }

    return false;
  }

  async function upload(file: File): Promise<void> {
    reset();

    const contentType = supportedContentTypeOf(file);
    if (contentType === null) {
      fail(describeUnsupportedFormat(file.name));
      return;
    }

    phase.value = 'requesting';

    let intent: CreateUploadIntentResponse;
    try {
      intent = await gateway.createUploadIntent({
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
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

    const outcome = await watchUntilSettled({
      gateway,
      transcriptionId: intent.transcriptionId,
      apply: applySettled,
    });

    // Not a failure. The file is uploaded and the record is in the history
    // still being transcribed, so the honest end state says exactly that.
    if (outcome === 'waiting') {
      phase.value = 'stillProcessing';
    }
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
