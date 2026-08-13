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
