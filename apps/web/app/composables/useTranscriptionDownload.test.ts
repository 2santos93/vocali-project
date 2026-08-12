import type { Transcription, TranscriptionStatus } from '@vocali/contracts';
import { SESSION_EXPIRED_MESSAGE } from './useTranscriptionHistory';
import {
  DOWNLOAD_FAILURE_MESSAGE,
  DOWNLOAD_NOT_READY_MESSAGE,
  buildTranscriptFileName,
  followDownloadUrlInBrowser,
  useTranscriptionDownload,
} from './useTranscriptionDownload';

function makeTranscription(overrides: Partial<Transcription> = {}): Transcription {
  return {
    id: 'transcription-1',
    fileName: 'consulta.mp3',
    source: 'FILE',
    status: 'COMPLETED',
    language: 'es',
    durationSeconds: 95,
    sizeBytes: 2 * 1024 * 1024,
    textPreview: 'El paciente refiere dolor lumbar.',
    errorMessage: null,
    createdAt: '2026-08-11T09:30:00.000Z',
    updatedAt: '2026-08-11T09:31:00.000Z',
    ...overrides,
  };
}

function signedUrlResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    url: 'https://storage.example.com/transcripts/transcription-1.txt?signature=abc',
    format: 'txt',
    expiresAt: '2026-08-11T09:45:00.000Z',
    ...overrides,
  };
}

function unauthorized(): Error & { statusCode: number } {
  return Object.assign(new Error('Unauthorized'), { statusCode: 401 });
}

describe('useTranscriptionDownload', () => {
  it('asks for the signed URL at click time and follows it', async () => {
    const requestUrl = jest.fn().mockResolvedValue(signedUrlResponse());
    const followUrl = jest.fn();
    const download = useTranscriptionDownload(requestUrl, followUrl);

    // Nothing is requested until the user asks for it: a URL minted with the
    // page would already be expired by the time most people reached for it.
    expect(requestUrl).not.toHaveBeenCalled();

    await download.download(makeTranscription());

    expect(requestUrl).toHaveBeenCalledTimes(1);
    expect(requestUrl).toHaveBeenCalledWith('transcription-1', 'txt');
    expect(followUrl).toHaveBeenCalledWith(
      'https://storage.example.com/transcripts/transcription-1.txt?signature=abc',
      'consulta.txt',
    );
    expect(download.errorMessage.value).toBeNull();
    expect(download.downloadingId.value).toBeNull();
  });

  it('asks for a fresh URL on every request, never reusing the last one', async () => {
    const requestUrl = jest.fn().mockResolvedValue(signedUrlResponse());
    const followUrl = jest.fn();
    const download = useTranscriptionDownload(requestUrl, followUrl);
    const transcription = makeTranscription();

    await download.download(transcription);
    await download.download(transcription);

    expect(requestUrl).toHaveBeenCalledTimes(2);
    expect(followUrl).toHaveBeenCalledTimes(2);
  });

  it('passes the requested format through and names the file after it', async () => {
    const requestUrl = jest.fn().mockResolvedValue(signedUrlResponse({ format: 'json' }));
    const followUrl = jest.fn();
    const download = useTranscriptionDownload(requestUrl, followUrl);

    await download.download(makeTranscription(), 'json');

    expect(requestUrl).toHaveBeenCalledWith('transcription-1', 'json');
    expect(followUrl).toHaveBeenCalledWith(expect.any(String), 'consulta.json');
  });

  /*
   * Only a COMPLETED transcription has a transcript object behind it. Asking
   * for any other status earns a 404, and a download that 404s reads to a
   * clinician as their dictation having been lost.
   */
  it.each<TranscriptionStatus>(['PENDING_UPLOAD', 'PROCESSING', 'FAILED'])(
    'never asks for a URL for a %s transcription',
    async (status) => {
      const requestUrl = jest.fn().mockResolvedValue(signedUrlResponse());
      const followUrl = jest.fn();
      const download = useTranscriptionDownload(requestUrl, followUrl);

      await download.download(makeTranscription({ status }));

      expect(requestUrl).not.toHaveBeenCalled();
      expect(followUrl).not.toHaveBeenCalled();
      expect(download.errorMessage.value).toBe(DOWNLOAD_NOT_READY_MESSAGE);
    },
  );

  it('marks the transcription being prepared while its URL is in flight', async () => {
    let settle: (value: unknown) => void = () => undefined;
    const requestUrl = jest.fn().mockReturnValue(
      new Promise<unknown>((resolve) => {
        settle = resolve;
      }),
    );
    const followUrl = jest.fn();
    const download = useTranscriptionDownload(requestUrl, followUrl);

    const inFlight = download.download(makeTranscription());
    expect(download.downloadingId.value).toBe('transcription-1');

    // A second press must not fire a second request against a URL that is
    // already being minted.
    await download.download(makeTranscription({ id: 'transcription-2' }));
    expect(requestUrl).toHaveBeenCalledTimes(1);

    settle(signedUrlResponse());
    await inFlight;

    expect(download.downloadingId.value).toBeNull();
  });

  it('reports a failure without leaving the row stuck', async () => {
    const requestUrl = jest.fn().mockRejectedValue(new Error('gateway timeout'));
    const followUrl = jest.fn();
    const download = useTranscriptionDownload(requestUrl, followUrl);

    await download.download(makeTranscription());

    expect(followUrl).not.toHaveBeenCalled();
    expect(download.errorMessage.value).toBe(DOWNLOAD_FAILURE_MESSAGE);
    expect(download.downloadingId.value).toBeNull();
  });

  it('tells an ended session apart from a failed download', async () => {
    const requestUrl = jest.fn().mockRejectedValue(unauthorized());
    const download = useTranscriptionDownload(requestUrl, jest.fn());

    await download.download(makeTranscription());

    expect(download.errorMessage.value).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it('refuses to follow a URL the contract does not recognise', async () => {
    const requestUrl = jest.fn().mockResolvedValue({ url: 'not-a-url', format: 'txt' });
    const followUrl = jest.fn();
    const download = useTranscriptionDownload(requestUrl, followUrl);

    await download.download(makeTranscription());

    expect(followUrl).not.toHaveBeenCalled();
    expect(download.errorMessage.value).toBe(DOWNLOAD_FAILURE_MESSAGE);
  });

  it('clears the reported failure when it is dismissed', async () => {
    const requestUrl = jest.fn().mockRejectedValue(new Error('gateway timeout'));
    const download = useTranscriptionDownload(requestUrl, jest.fn());

    await download.download(makeTranscription());
    download.dismissError();

    expect(download.errorMessage.value).toBeNull();
  });
});

describe('buildTranscriptFileName', () => {
  it('replaces the audio extension rather than appending to it', () => {
    expect(buildTranscriptFileName('consulta.mp3', 'txt')).toBe('consulta.txt');
    expect(buildTranscriptFileName('consulta.mp3', 'json')).toBe('consulta.json');
  });

  it('keeps a name that has no extension, and every dot before the last one', () => {
    expect(buildTranscriptFileName('consulta', 'txt')).toBe('consulta.txt');
    expect(buildTranscriptFileName('2026.08.11 consulta.wav', 'txt')).toBe(
      '2026.08.11 consulta.txt',
    );
    expect(buildTranscriptFileName('.consulta', 'txt')).toBe('.consulta.txt');
  });
});

describe('followDownloadUrlInBrowser', () => {
  it('clicks an anchor carrying the URL, and leaves nothing behind', () => {
    const clicked: { href: string; download: string }[] = [];
    // jsdom implements no navigation, and the navigation is not what this
    // asserts: what matters is the URL the browser was handed.
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function replaceNavigation(this: HTMLAnchorElement): void {
        clicked.push({ href: this.href, download: this.download });
      });

    followDownloadUrlInBrowser('https://storage.example.com/t.txt?signature=abc', 'consulta.txt');

    expect(clicked).toEqual([
      { href: 'https://storage.example.com/t.txt?signature=abc', download: 'consulta.txt' },
    ]);
    expect(document.querySelectorAll('a')).toHaveLength(0);

    click.mockRestore();
  });
});
