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
import { transcriptionPath, UPLOADS_PATH } from '../utils/api-routes';
import type { ApiRequester } from '../utils/types/ApiRequester';
import { watchUntilSettled } from './settlement-watch';
import type { FileUploadController } from './types/FileUploadController';
import type { FileUploadFailure } from './types/FileUploadFailure';
import type { FileUploadGateway } from './types/FileUploadGateway';
import type { FileUploadPhase } from './types/FileUploadPhase';
import type { SocketFactory } from './types/SocketFactory';
import {
  describeIntentFailure,
  describeUnsupportedFormat,
  describeUploadFailure,
  TRANSCRIPTION_FAILED,
} from './upload-failures';
import { createUpdateStreamOpener } from './useTranscriptionUpdates';

/**
 * Nothing here reaches the network itself: every call is a collaborator on
 * `FileUploadGateway`, supplied by the page, which is the only place `$fetch`
 * appears. Pinning a state machine with four failure exits means driving it,
 * not stubbing a global.
 *
 * Nothing enforces that. This file could name `$fetch` and both gates would
 * pass — ts-jest type checks nothing here, and `tsconfig.app.json` grants
 * composables the Nuxt types because composables are allowed the runtime.
 */

/**
 * Separated from the page so the paths and the response validation are
 * exercised by the test suite. A path spelled wrong is a 404 that appears only
 * on a deployed environment, and a page is the one layer Jest never mounts.
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
       * Parsed, not asserted: a type argument on the request checks nothing at
       * run time, so a shape the contract does not promise would surface as an
       * undefined property inside the upload instead of here.
       */
      return CreateUploadIntentResponseSchema.parse(response);
    },

    async getTranscription(transcriptionId: string): Promise<Transcription> {
      const response = await request(transcriptionPath(transcriptionId), { method: 'GET' });
      return TranscriptionSchema.parse(response);
    },

    // Optional so the page's existing call still compiles, and injectable at
    // all because a test cannot open a real socket.
    openUpdateStream: createUpdateStreamOpener(request, createSocket),
  };
}

type SupportedContentType = CreateUploadIntentRequest['contentType'];

/**
 * A search rather than a cast: `File.type` is whatever the operating system
 * told the browser and can be empty, so asserting it into the contract's union
 * would push an invalid request to the API.
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
   * One function for both the pushed record and the polled one: they are the
   * same record by different routes, and two copies would drift over what
   * "finished" means.
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

    // Not a failure: the file is uploaded and the record is in the history,
    // still being transcribed.
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
