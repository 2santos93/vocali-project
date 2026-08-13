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

/**
 * The transcript is named after the audio it came from, with the audio's own
 * extension replaced. A folder of `consulta.mp3` and `consulta.txt` is
 * readable; a folder of `consulta.mp3.txt` and opaque record ids is not.
 */
export function buildTranscriptFileName(fileName: string, format: TranscriptFormat): string {
  const extensionStart = fileName.lastIndexOf('.');
  const stem = extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName;
  return `${stem}.${FORMAT_EXTENSIONS[format]}`;
}

/**
 * An anchor rather than `window.open`: the URL only exists after an await, and
 * Safari blocks a popup opened outside the synchronous part of a click. The
 * `download` attribute is a hint only, since the URL is cross-origin.
 */
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
    /*
     * The rule itself, not the affordance the table renders: a row refreshed
     * into another status between render and click still cannot fire the
     * request, which would 404 and read to a clinician as data loss.
     */
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
      /*
       * Asked for at click time, never rendered into the page ahead of it: the
       * URL is signed and short-lived, and one minted at page load would have
       * expired into a broken link by the time a user reached for it.
       */
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
