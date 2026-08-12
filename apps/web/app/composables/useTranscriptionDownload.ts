import { ref } from 'vue';
import type { Ref } from 'vue';
import { DownloadUrlResponseSchema } from '@vocali/contracts';
import type { Transcription, TranscriptFormat } from '@vocali/contracts';
import { SESSION_EXPIRED_MESSAGE, isSessionExpired } from './useTranscriptionHistory';

/**
 * Asks the API for a signed URL for one transcript, as a collaborator so the
 * rules around it can be driven under Jest. Resolves to `unknown`: the answer
 * has crossed a trust boundary and is parsed, not asserted.
 */
export type RequestDownloadUrl = (
  transcriptionId: string,
  format: TranscriptFormat,
) => Promise<unknown>;

/** Hands the signed URL to the browser. Substituted in tests. */
export type FollowDownloadUrl = (url: string, fileName: string) => void;

export interface TranscriptionDownload {
  /** The transcription whose URL is being fetched, so its row can show it. */
  readonly downloadingId: Readonly<Ref<string | null>>;
  readonly errorMessage: Readonly<Ref<string | null>>;
  download: (transcription: Transcription, format?: TranscriptFormat) => Promise<void>;
  dismissError: () => void;
}

export const DOWNLOAD_FAILURE_MESSAGE =
  'No hemos podido preparar la descarga. Vuelve a intentarlo.';

export const DOWNLOAD_NOT_READY_MESSAGE = 'Solo puedes descargar una transcripción completada.';

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
 * The default way of following the URL, in a browser.
 *
 * An anchor rather than `window.open`: the URL only exists after an await, and
 * a popup opened outside the synchronous part of a click is what Safari
 * blocks. The `download` attribute is a hint only — the URL is cross-origin,
 * so the object's own `Content-Disposition` decides the file name — but it
 * costs nothing and is honoured where it can be.
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
  const errorMessage = ref<string | null>(null);

  async function download(
    transcription: Transcription,
    format: TranscriptFormat = 'txt',
  ): Promise<void> {
    /*
     * Only a COMPLETED transcription has a transcript object behind it. Asking
     * for a URL for any other status earns a 404, and a download that 404s
     * reads to a clinician as their dictation having been lost. The table
     * already offers the action only on a completed row; this is the rule
     * itself rather than the affordance, so a row that is refreshed into
     * another status between render and click still cannot fire the request.
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
       * Asked for here, at click time, and never rendered into the page ahead
       * of it. The URL is signed and short-lived: one minted when the page
       * loaded may well have expired by the time a user reaches for it, and
       * the expiry surfaces as a broken link rather than as anything a user
       * could act on.
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
