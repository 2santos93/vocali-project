/**
 * The two browser capabilities a dictation needs that no HTTP stub can reach.
 *
 * `cy.intercept` works at the network boundary, and neither of these crosses
 * it: a microphone is a device, and the provider's transcription stream is a
 * websocket, which the interceptor does not see. Both are therefore replaced
 * at the boundary the application itself uses — `getUserMedia` and the
 * `WebSocket` constructor — and everything above them is the real thing: the
 * real `AudioContext`, the real worklet module fetched from the real server,
 * the real state machine in `useAudioRecorder`, the real screen.
 *
 * What this does not prove is stated plainly: no audio is transcribed here and
 * no provider is contacted. The frames the panel renders are the frames this
 * file sends, so what is under test is the application's half of the protocol
 * — that it announces the session it was given, shows a partial as
 * provisional, promotes a confirmed segment, survives a socket that drops, and
 * saves what it has.
 */

type SocketListener = (event: unknown) => void;

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

/**
 * Stands in for the provider's websocket.
 *
 * Written by hand rather than as an `EventTarget` subclass so a spec can hold
 * the sent frames and drive the received ones directly, and so nothing depends
 * on dispatching an event across the boundary between the spec's realm and the
 * application's.
 */
export class ProviderSocket {
  /** Every socket the application has opened since the last page load. */
  public static readonly opened: ProviderSocket[] = [];

  public readonly url: string;

  /** Everything the application sent as text, parsed. */
  public readonly messagesSent: unknown[] = [];

  /** Audio is sent as binary, so it is counted rather than kept. */
  public audioFramesSent = 0;

  /** The code the application asked to close with, if it closed the socket. */
  public closeCodeRequested: number | null = null;

  public binaryType = 'blob';

  public readyState: number = CONNECTING;

  private readonly listeners = new Map<string, SocketListener[]>();

  public constructor(url: string) {
    this.url = url;
    ProviderSocket.opened.push(this);
  }

  public addEventListener(type: string, listener: SocketListener): void {
    const registered = this.listeners.get(type) ?? [];
    registered.push(listener);
    this.listeners.set(type, registered);
  }

  public send(payload: unknown): void {
    if (typeof payload === 'string') {
      const frame: unknown = JSON.parse(payload);
      this.messagesSent.push(frame);
      return;
    }

    this.audioFramesSent += 1;
  }

  public close(code: number): void {
    this.readyState = CLOSED;
    this.closeCodeRequested = code;
  }

  /** The handshake completing, which is when the application introduces itself. */
  public accept(): void {
    this.readyState = OPEN;
    this.emit('open', {});
  }

  /** One frame from the provider. */
  public deliver(frame: Record<string, unknown>): void {
    this.emit('message', { data: JSON.stringify(frame) });
  }

  /** The connection going away underneath a dictation that is still running. */
  public drop(code: number): void {
    this.readyState = CLOSED;
    this.emit('close', { code });
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

/**
 * Installs both doubles into the window about to be loaded.
 *
 * The microphone is a real `MediaStream` carrying silence rather than a bare
 * object, because the application feeds it to a real `AudioContext`: a
 * substitute with no audio track fails inside `createMediaStreamSource`, which
 * would be the test failing at its own scaffolding rather than at the screen.
 */
export function useSilentMicrophoneAndProviderSocket(win: Cypress.AUTWindow): void {
  ProviderSocket.opened.length = 0;

  Object.defineProperty(win, 'WebSocket', {
    value: ProviderSocket,
    writable: true,
    configurable: true,
  });

  const silence = new win.AudioContext().createMediaStreamDestination();

  Object.defineProperty(win.navigator.mediaDevices, 'getUserMedia', {
    value: (): Promise<MediaStream> => Promise.resolve(silence.stream),
    writable: true,
    configurable: true,
  });
}

/**
 * The socket the application opened, once it has opened one.
 *
 * The assertion is what makes this wait: `should` retries against the live
 * array until the application gets there, so no spec has to guess how long
 * minting a session takes.
 */
export function providerSocket(): Cypress.Chainable<ProviderSocket> {
  return cy
    .wrap(ProviderSocket.opened, { log: false })
    .should('have.length', 1)
    .then((opened: ProviderSocket[]) => opened[0] as ProviderSocket);
}
