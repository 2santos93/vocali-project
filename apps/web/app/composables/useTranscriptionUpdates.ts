import { ConnectionTicketResponseSchema, TranscriptionUpdateEventSchema } from '@vocali/contracts';
import type { Transcription } from '@vocali/contracts';
import { CONNECTION_TICKETS_PATH } from '../utils/api-routes';
import type { ApiRequester } from '../utils/types/api';
import type {
  SocketFactory,
  SocketLike,
  TranscriptionUpdateStream,
  UpdateStreamHandlers,
  UpdateStreamOpener,
} from './types/settlement';

/**
 * The request function and the socket constructor are both injected, so the
 * failure paths can be driven rather than stubbed. A convention only: ts-jest
 * type checks nothing here, and composables are granted the Nuxt types, so a
 * Nuxt global written here would fail only at run time.
 *
 * Why a socket at all when a Lambda cannot hold one: API Gateway holds this
 * connection, not a function. See `docs/adr/0011`.
 */

/** The query parameter the `$connect` authorizer reads the ticket from. */
const TICKET_QUERY_PARAMETER = 'ticket';

/** Rejected when the socket could not be opened; the caller falls back to polling. */
export class UpdateStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpdateStreamError';
  }
}

function defaultSocketFactory(url: string): SocketLike {
  return new WebSocket(url);
}

/**
 * **The ticket, never the access token.** A browser cannot set a header on a
 * `WebSocket`, so the credential travels in the query string, which API
 * Gateway writes into its access log verbatim. The ticket lives thirty seconds
 * and can be spent once, so a leaked log line holds something already dead.
 *
 * The returned promise settles on the handshake, not on the request: resolving
 * early would have the caller wait out its whole budget on a socket that was
 * constructed but refused.
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
     * Parsed, not asserted: a malformed response would otherwise become
     * `undefined` inside a URL and a socket dialled at the string "undefined".
     */
    const ticket = ConnectionTicketResponseSchema.parse(response);

    const url = `${ticket.websocketUrl}?${TICKET_QUERY_PARAMETER}=${encodeURIComponent(ticket.ticket)}`;
    const socket = createSocket(url);

    return new Promise<TranscriptionUpdateStream>((resolve, reject) => {
      // A failed handshake emits both `error` and `close`. Without this,
      // `onClosed` would fire for a stream the caller was never given.
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
        // An unrecognised frame is dropped rather than raised: treating the
        // first unfamiliar one as an error breaks on the next thing the API adds.
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

/** Null for anything this client cannot read: not a string, not JSON, wrong shape. */
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
