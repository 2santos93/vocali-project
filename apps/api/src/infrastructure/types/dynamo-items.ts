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

/**
 * A client sends this back unmodified, which makes it attacker-controlled
 * input and is why every field is checked rather than parsed and trusted. It
 * must also agree byte for byte with what the in-memory double emits, and the
 * double keeps its own implementation on purpose: two implementations that
 * agree is evidence, one shared implementation is only a definition.
 */
export interface CursorPayload {
  readonly userId: string;
  readonly id: string;
}
