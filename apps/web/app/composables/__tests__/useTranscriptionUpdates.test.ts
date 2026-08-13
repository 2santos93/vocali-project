import type { ConnectionTicketResponse, Transcription } from '@vocali/contracts';
import type { ApiRequestOptions } from '../../utils/types/api';
import { createUpdateStreamOpener, UpdateStreamError } from '../useTranscriptionUpdates';
import type { SocketLike, UpdateStreamHandlers } from '../types/settlement';

const TICKET: ConnectionTicketResponse = {
  ticket: 'Zx91QeRt44PLm_-abc',
  websocketUrl: 'wss://sockets.test/live',
  expiresAt: '2026-08-12T09:00:30.000Z',
};

const TRANSCRIPTION: Transcription = {
  id: 't-1',
  fileName: 'consulta-paciente.mp3',
  source: 'FILE',
  status: 'COMPLETED',
  language: 'es',
  durationSeconds: 42,
  sizeBytes: 1_048_576,
  textPreview: 'El paciente refiere…',
  errorMessage: null,
  createdAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:01:00.000Z',
};

interface SocketDouble extends SocketLike {
  readonly urls: string[];
  closes: number;
  open(): void;
  drop(): void;
  fail(): void;
  deliver(data: unknown): void;
}

function socketDouble(urls: string[]): SocketDouble {
  const listeners = new Map<string, ((event: never) => void)[]>();

  function emit(type: string, event: unknown): void {
    for (const listener of listeners.get(type) ?? []) {
      (listener as (value: unknown) => void)(event);
    }
  }

  return {
    urls,
    closes: 0,
    addEventListener(type: string, listener: (event: never) => void): void {
      const existing = listeners.get(type) ?? [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    close(): void {
      this.closes += 1;
    },
    open: (): void => {
      emit('open', undefined);
    },
    drop: (): void => {
      emit('close', undefined);
    },
    fail: (): void => {
      emit('error', undefined);
    },
    deliver: (data: unknown): void => {
      emit('message', { data });
    },
  };
}

interface Harness {
  readonly open: (handlers: UpdateStreamHandlers) => Promise<{ close(): void }>;
  readonly socket: SocketDouble;
  readonly urls: string[];
  readonly requests: { path: string; options: ApiRequestOptions }[];
}

function buildHarness(ticketResponse: unknown = TICKET): Harness {
  const urls: string[] = [];
  const requests: { path: string; options: ApiRequestOptions }[] = [];
  const socket = socketDouble(urls);

  const opener = createUpdateStreamOpener(
    (path, options) => {
      requests.push({ path, options });
      return Promise.resolve(ticketResponse);
    },
    (url: string) => {
      urls.push(url);
      return socket;
    },
  );

  return { open: opener, socket, urls, requests };
}

/** Handlers that record everything, so a test can assert on what arrived. */
function recordingHandlers(): UpdateStreamHandlers & {
  received: Transcription[];
  closed: number;
} {
  const received: Transcription[] = [];

  return {
    received,
    closed: 0,
    onTranscription(transcription: Transcription): void {
      received.push(transcription);
    },
    onClosed(): void {
      this.closed += 1;
    },
  };
}

describe('createUpdateStreamOpener', () => {
  it('asks for a ticket at POST /api/connection-tickets', async () => {
    const harness = buildHarness();
    const opening = harness.open(recordingHandlers());
    await Promise.resolve();
    harness.socket.open();
    await opening;

    expect(harness.requests).toEqual([
      { path: '/api/connection-tickets', options: { method: 'POST' } },
    ]);
  });

  it('dials the endpoint the ticket named, carrying the ticket and nothing else', async () => {
    const harness = buildHarness();
    const opening = harness.open(recordingHandlers());
    await Promise.resolve();
    harness.socket.open();
    await opening;

    expect(harness.urls).toEqual(['wss://sockets.test/live?ticket=Zx91QeRt44PLm_-abc']);
  });

  it('escapes the ticket, so a value needing it cannot break the query string', async () => {
    const harness = buildHarness({ ...TICKET, ticket: 'a+b/c=d&e' });
    const opening = harness.open(recordingHandlers());
    await Promise.resolve();
    harness.socket.open();
    await opening;

    expect(harness.urls[0]).toBe('wss://sockets.test/live?ticket=a%2Bb%2Fc%3Dd%26e');
  });

  it('does not resolve until the socket has actually opened', async () => {
    const harness = buildHarness();
    let resolved = false;
    void harness.open(recordingHandlers()).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    harness.socket.open();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('rejects when the handshake fails', async () => {
    const harness = buildHarness();
    const opening = harness.open(recordingHandlers());
    await Promise.resolve();
    harness.socket.fail();

    await expect(opening).rejects.toBeInstanceOf(UpdateStreamError);
  });

  it('rejects when the socket closes before it ever opened', async () => {
    const harness = buildHarness();
    const opening = harness.open(recordingHandlers());
    await Promise.resolve();
    harness.socket.drop();

    await expect(opening).rejects.toBeInstanceOf(UpdateStreamError);
  });

  it('does not report a close for a stream the caller never got', async () => {
    const harness = buildHarness();
    const handlers = recordingHandlers();
    const opening = harness.open(handlers);
    await Promise.resolve();
    harness.socket.fail();
    harness.socket.drop();
    await expect(opening).rejects.toBeInstanceOf(UpdateStreamError);

    expect(handlers.closed).toBe(0);
  });

  it('rejects when the ticket response is not what the contract describes', async () => {
    const harness = buildHarness({ ticket: 'only-a-ticket' });

    await expect(harness.open(recordingHandlers())).rejects.toThrow();
    // Nothing was dialled: a malformed response would otherwise become
    // `undefined` inside the URL and a socket opened at the string "undefined".
    expect(harness.urls).toEqual([]);
  });

  it('hands over a pushed transcription', async () => {
    const harness = buildHarness();
    const handlers = recordingHandlers();
    const opening = harness.open(handlers);
    await Promise.resolve();
    harness.socket.open();
    await opening;

    harness.socket.deliver(
      JSON.stringify({ type: 'transcription.updated', transcription: TRANSCRIPTION }),
    );

    expect(handlers.received).toEqual([TRANSCRIPTION]);
  });

  it('reports a drop once the stream is open', async () => {
    const harness = buildHarness();
    const handlers = recordingHandlers();
    const opening = harness.open(handlers);
    await Promise.resolve();
    harness.socket.open();
    await opening;

    harness.socket.drop();

    expect(handlers.closed).toBe(1);
  });

  it('closes the underlying socket when the stream is closed', async () => {
    const harness = buildHarness();
    const opening = harness.open(recordingHandlers());
    await Promise.resolve();
    harness.socket.open();
    const stream = await opening;

    stream.close();

    expect(harness.socket.closes).toBe(1);
  });

  it.each([
    ['a frame that is not a string', { some: 'object' }],
    ['a frame that is not JSON', 'not json at all'],
    ['a frame with no type', JSON.stringify({ transcription: TRANSCRIPTION })],
    [
      'a frame of an unrecognised type',
      JSON.stringify({ type: 'something.else', transcription: TRANSCRIPTION }),
    ],
    [
      'a frame whose transcription the contract rejects',
      JSON.stringify({ type: 'transcription.updated', transcription: { id: 't-1' } }),
    ],
  ])('ignores %s', async (_name: string, frame: unknown) => {
    const harness = buildHarness();
    const handlers = recordingHandlers();
    const opening = harness.open(handlers);
    await Promise.resolve();
    harness.socket.open();
    await opening;

    expect(() => {
      harness.socket.deliver(frame);
    }).not.toThrow();
    expect(handlers.received).toEqual([]);
  });

  it('dials the browser socket at the ticket URL when no factory is supplied', async () => {
    const dialled: string[] = [];
    const constructed: SocketDouble[] = [];
    const construct = jest.fn((url: string): SocketDouble => {
      dialled.push(url);
      const socket = socketDouble(dialled);
      constructed.push(socket);
      return socket;
    });
    const browserSocket = globalThis.WebSocket;
    Object.assign(globalThis, { WebSocket: construct });

    try {
      const opener = createUpdateStreamOpener(() => Promise.resolve(TICKET));
      const opening = opener(recordingHandlers());
      await Promise.resolve();
      constructed[0]!.open();
      await opening;

      expect(dialled).toEqual(['wss://sockets.test/live?ticket=Zx91QeRt44PLm_-abc']);
    } finally {
      Object.assign(globalThis, { WebSocket: browserSocket });
    }
  });
});
