import { ConnectionTicketResponseSchema, TranscriptionUpdateEventSchema } from '@vocali/contracts';
import type { Transcription } from '@vocali/contracts';
import type { ApiRequester } from '../utils/api-request';
import { CONNECTION_TICKETS_PATH } from '../utils/api-routes';

/**
 * The websocket the API pushes finished transcriptions down.
 *
 * Nothing here reaches the network by itself either: the request function and
 * the socket constructor are both injected, for the same two reasons the
 * upload flow injects its gateway — the failure paths are the interesting part
 * and have to be driven rather than stubbed, and a bare Nuxt global anywhere
 * in this file would fail to compile under Jest whether or not a test reached
 * it.
 *
 * Why a socket at all, when the platform has already decided that a Lambda
 * cannot hold one: API Gateway holds this connection, not a function. See
 * `docs/adr/0011`.
 */

/** The query parameter the `$connect` authorizer reads the ticket from. */
const TICKET_QUERY_PARAMETER = 'ticket';

/**
 * The subset of `WebSocket` this file uses.
 *
 * Narrowed so a test can supply a double without implementing a protocol, and
 * so it is obvious that nothing here sends: the browser opens this socket and
 * listens. There is no `send`, and the API has no route that would receive
 * one.
 */
export interface SocketLike {
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

export interface UpdateStreamHandlers {
  /** One settled transcription, already validated against the shared contract. */
  onTranscription: (transcription: Transcription) => void;
  /**
   * The socket ended, for any reason — a close frame, a network drop, the
   * two-hour ceiling API Gateway imposes on every connection. The caller's
   * business is that pushes have stopped arriving, not which of those it was.
   */
  onClosed: () => void;
}

export interface TranscriptionUpdateStream {
  close(): void;
}

/** Rejected when the socket could not be opened; the caller falls back to polling. */
export class UpdateStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpdateStreamError';
  }
}

export type UpdateStreamOpener = (
  handlers: UpdateStreamHandlers,
) => Promise<TranscriptionUpdateStream>;

function defaultSocketFactory(url: string): SocketLike {
  return new WebSocket(url);
}

/**
 * Asks for a connection ticket and opens the socket with it.
 *
 * **The ticket, never the access token.** A browser cannot set a header on a
 * `WebSocket`, so whatever authenticates the handshake has to travel in the
 * query string — and a query string is written into API Gateway's access log
 * verbatim. The ticket is built to survive that: it lives thirty seconds and
 * can be spent once, so a leaked log line holds something already expired,
 * already used, or both. The session cookie the BFF holds never leaves the
 * front end's origin.
 *
 * The endpoint comes back with the ticket rather than being configured here,
 * so the front end holds no copy of a deployment fact.
 *
 * The returned promise settles on the handshake, not on the request: a socket
 * that was constructed but refused is not a stream, and resolving early would
 * have the caller wait out its whole budget on a connection that never opened.
 */
export function createUpdateStreamOpener(
  request: ApiRequester,
  createSocket: SocketFactory = defaultSocketFactory,
): UpdateStreamOpener {
  return async function openUpdateStream(
    handlers: UpdateStreamHandlers,
  ): Promise<TranscriptionUpdateStream> {
    const response = await request(CONNECTION_TICKETS_PATH, { method: 'POST' });
    /*
     * Parsed, not asserted, like every other response this front end reads. A
     * malformed ticket response would otherwise become `undefined` inside a
     * URL and a socket dialled at the string "undefined".
     */
    const ticket = ConnectionTicketResponseSchema.parse(response);

    const url = `${ticket.websocketUrl}?${TICKET_QUERY_PARAMETER}=${encodeURIComponent(ticket.ticket)}`;
    const socket = createSocket(url);

    return new Promise<TranscriptionUpdateStream>((resolve, reject) => {
      // `close` fires after `error` as well as on its own, and a handshake
      // that fails emits both. Without this the promise would be settled
      // twice, which is harmless, and `onClosed` would be called for a stream
      // the caller was never given, which is not: it would report a drop the
      // caller cannot correlate with anything.
      let opened = false;

      socket.addEventListener('open', () => {
        opened = true;
        resolve({
          close: () => {
            socket.close();
          },
        });
      });

      socket.addEventListener('message', (event: { data: unknown }) => {
        const update = readTranscriptionUpdate(event.data);
        // A frame this client does not recognise is dropped rather than
        // raised. A socket is a stream of unrelated messages by nature, and a
        // client that treated the first unfamiliar frame as an error would
        // break on the first thing the API ever adds.
        if (update !== null) {
          handlers.onTranscription(update);
        }
      });

      socket.addEventListener('error', () => {
        if (!opened) {
          reject(new UpdateStreamError('The update socket could not be opened'));
        }
      });

      socket.addEventListener('close', () => {
        if (opened) {
          handlers.onClosed();
          return;
        }
        reject(new UpdateStreamError('The update socket closed before it opened'));
      });
    });
  };
}

/**
 * One pushed transcription, or null for anything this client cannot read.
 *
 * Every step can fail on data from the network — a frame that is not a string,
 * not JSON, or not the shape the contract promises — and each of those is the
 * same answer to the caller: there is nothing here to act on.
 */
function readTranscriptionUpdate(data: unknown): Transcription | null {
  if (typeof data !== 'string') return null;

  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }

  const parsed = TranscriptionUpdateEventSchema.safeParse(payload);

  return parsed.success ? parsed.data.transcription : null;
}
