import type { SocketLike } from './SocketLike';

export type SocketFactory = (url: string) => SocketLike;
