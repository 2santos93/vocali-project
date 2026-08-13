import { ref } from 'vue';
import { DownloadUrlResponseSchema } from '@vocali/contracts';
import type { Transcription, TranscriptFormat } from '@vocali/contracts';
import type { TranslatableMessage } from '../i18n/types';
import { isSessionExpired, SESSION_EXPIRED_MESSAGE } from '../utils/http-failure';
import type {
  FollowDownloadUrl,
  RequestDownloadUrl,
  TranscriptionDownload,
} from './types/transcriptions';

export const DOWNLOAD_FAILURE_MESSAGE: TranslatableMessage = { key: 'failure.download' };

export const DOWNLOAD_NOT_READY_MESSAGE: TranslatableMessage = { key: 'failure.downloadNotReady' };

const FORMAT_EXTENSIONS: Record<TranscriptFormat, string> = {
  txt: 'txt',
  json: 'json',
};

export function buildTranscriptFileName(fileName: string, format: TranscriptFormat): string {
  const extensionStart = fileName.lastIndexOf('.');
  const stem = extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName;
  return `${stem}.${FORMAT_EXTENSIONS[format]}`;
}

export function followDownloadUrlInBrowser(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function useTranscriptionDownload(
  requestUrl: RequestDownloadUrl,
  followUrl: FollowDownloadUrl = followDownloadUrlInBrowser,
): TranscriptionDownload {
  const downloadingId = ref<string | null>(null);
  const errorMessage = ref<TranslatableMessage | null>(null);

  async function download(
    transcription: Transcription,
    format: TranscriptFormat = 'txt',
  ): Promise<void> {
    if (transcription.status !== 'COMPLETED') {
      errorMessage.value = DOWNLOAD_NOT_READY_MESSAGE;
      return;
    }
    if (downloadingId.value !== null) {
      return;
    }

    downloadingId.value = transcription.id;
    errorMessage.value = null;
    try {
      const response = DownloadUrlResponseSchema.parse(await requestUrl(transcription.id, format));
      followUrl(response.url, buildTranscriptFileName(transcription.fileName, response.format));
    } catch (error) {
      errorMessage.value = isSessionExpired(error)
        ? SESSION_EXPIRED_MESSAGE
        : DOWNLOAD_FAILURE_MESSAGE;
    } finally {
      downloadingId.value = null;
    }
  }

  function dismissError(): void {
    errorMessage.value = null;
  }

  return { downloadingId, errorMessage, download, dismissError };
}
