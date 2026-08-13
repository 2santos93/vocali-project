import type { TranscriptionPrimitives } from '../../domain/types/transcription.js';
import type { TTL_ATTRIBUTE } from '../persistence/connection.mapper.js';

export interface TranscriptionKey {
  readonly PK: string;
  readonly SK: string;
}

export type TranscriptionItem = TranscriptionKey & TranscriptionPrimitives;

export type ClientSessionItem = TranscriptionKey & { readonly transcriptionId: string };

export interface ConnectionItem {
  readonly PK: string;
  readonly SK: string;
  readonly connectionId: string;
  readonly [TTL_ATTRIBUTE]: number;
}

export interface TicketItem {
  readonly PK: string;
  readonly SK: string;
  readonly userId: string;
  readonly expiresAt: string;
  readonly [TTL_ATTRIBUTE]: number;
}

export interface CursorPayload {
  readonly userId: string;
  readonly id: string;
}
