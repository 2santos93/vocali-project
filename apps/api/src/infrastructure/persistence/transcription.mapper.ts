import {
  SUPPORTED_TRANSCRIPTION_LANGUAGES,
  TRANSCRIPTION_SOURCES,
  TRANSCRIPTION_STATUSES,
} from '@vocali/contracts/constants';
import { z } from 'zod';
import type { TranscriptionPrimitives } from '../../domain/entities/transcription.js';

/** `PK = USER#<userId>`, `SK = TRANS#<transcriptionId>`. */
export const PARTITION_KEY_PREFIX = 'USER#';
export const TRANSCRIPTION_SORT_KEY_PREFIX = 'TRANS#';

export interface TranscriptionKey {
  readonly PK: string;
  readonly SK: string;
}

export type TranscriptionItem = TranscriptionKey & TranscriptionPrimitives;

export function buildPartitionKey(userId: string): string {
  return `${PARTITION_KEY_PREFIX}${userId}`;
}

export function buildTranscriptionSortKey(transcriptionId: string): string {
  return `${TRANSCRIPTION_SORT_KEY_PREFIX}${transcriptionId}`;
}

/**
 * Raised when a stored record does not match the shape the domain expects.
 *
 * It is not a `DomainError`: `DomainErrorCode` is the closed union the
 * frontend branches on exhaustively, and no client can act on schema drift —
 * the HTTP mapper turns anything unrecognised into a generic 500, which is
 * the right answer here. What matters is that the failure is deliberate and
 * carries a stable `code`, rather than surfacing as a `TypeError` thrown deep
 * inside the entity when it reads a property off a record that never had one.
 */
export class MalformedTranscriptionRecordError extends Error {
  readonly code = 'MALFORMED_PERSISTED_RECORD';

  constructor(reason: string) {
    super(`Stored transcription record is malformed: ${reason}`);
    this.name = 'MalformedTranscriptionRecordError';
  }
}

/**
 * Annotated as `ZodType<TranscriptionPrimitives>` on purpose: if the entity
 * gains a field and this schema does not, the assignment stops compiling.
 * A mapper that silently drops a new field is the failure mode this guards.
 */
const StoredTranscriptionSchema: z.ZodType<TranscriptionPrimitives> = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  fileName: z.string().min(1),
  source: z.enum(TRANSCRIPTION_SOURCES),
  status: z.enum(TRANSCRIPTION_STATUSES),
  language: z.enum(SUPPORTED_TRANSCRIPTION_LANGUAGES),
  sizeBytes: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  audioObjectKey: z.string().nullable(),
  transcriptObjectKey: z.string().nullable(),
  externalJobId: z.string().nullable(),
  textPreview: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * The keys are stored alongside the plain `userId` and `id` rather than being
 * parsed back out of them on read. Prefixed keys are a storage concern, and a
 * parser would have to decide what a `#` inside a user id means; keeping both
 * removes the question at the cost of a few bytes.
 */
export function toTranscriptionItem(primitives: TranscriptionPrimitives): TranscriptionItem {
  return {
    PK: buildPartitionKey(primitives.userId),
    SK: buildTranscriptionSortKey(primitives.id),
    id: primitives.id,
    userId: primitives.userId,
    fileName: primitives.fileName,
    source: primitives.source,
    status: primitives.status,
    language: primitives.language,
    sizeBytes: primitives.sizeBytes,
    durationSeconds: primitives.durationSeconds,
    audioObjectKey: primitives.audioObjectKey,
    transcriptObjectKey: primitives.transcriptObjectKey,
    externalJobId: primitives.externalJobId,
    textPreview: primitives.textPreview,
    errorMessage: primitives.errorMessage,
    createdAt: primitives.createdAt,
    updatedAt: primitives.updatedAt,
  };
}

export function toTranscriptionPrimitives(item: unknown): TranscriptionPrimitives {
  const parsed = StoredTranscriptionSchema.safeParse(item);
  if (!parsed.success) {
    // The reasons name the offending attributes and nothing else. The record's
    // own values are clinical data and must not travel into a log line.
    const reasons = parsed.error.issues
      .map((issue) => `${issue.path.join('.')} (${issue.code})`)
      .join(', ');
    throw new MalformedTranscriptionRecordError(reasons);
  }

  return parsed.data;
}
