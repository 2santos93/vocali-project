/**
 * Narrowed so a test can supply a double without implementing a protocol.
 * There is no `send`, and the API has no route that would receive one.
 */
export interface SocketLike {
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
}
