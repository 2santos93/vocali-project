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
/**
 * `SK = IDEM#<clientSessionId>` in the user's own partition, so claiming a key
 * and writing the record it belongs to are one transaction against one
 * partition, and one user's session ids cannot collide with another's.
 *
 * The history query is `begins_with(SK, 'TRANS#')`, so these items are already
 * invisible to it.
 */
export const CLIENT_SESSION_SORT_KEY_PREFIX = 'IDEM#';

export interface TranscriptionKey {
  readonly PK: string;
  readonly SK: string;
}

export type TranscriptionItem = TranscriptionKey & TranscriptionPrimitives;

/** Points at the record that claimed the key; it holds nothing else. */
export type ClientSessionItem = TranscriptionKey & { readonly transcriptionId: string };

export function buildPartitionKey(userId: string): string {
  return `${PARTITION_KEY_PREFIX}${userId}`;
}

export function buildTranscriptionSortKey(transcriptionId: string): string {
  return `${TRANSCRIPTION_SORT_KEY_PREFIX}${transcriptionId}`;
}

export function buildClientSessionSortKey(clientSessionId: string): string {
  return `${CLIENT_SESSION_SORT_KEY_PREFIX}${clientSessionId}`;
}

export function toClientSessionItem(input: {
  userId: string;
  clientSessionId: string;
  transcriptionId: string;
}): ClientSessionItem {
  return {
    PK: buildPartitionKey(input.userId),
    SK: buildClientSessionSortKey(input.clientSessionId),
    transcriptionId: input.transcriptionId,
  };
}

/**
 * Reads the pointer back, refusing anything that is not one rather than
 * returning a plausible id: a claim item whose shape has drifted would
 * otherwise resolve a retry onto whatever record that value names.
 */
export function toClaimedTranscriptionId(item: unknown): string {
  if (typeof item !== 'object' || item === null) {
    throw new MalformedTranscriptionRecordError('client session claim is not an object');
  }

  const transcriptionId: unknown = (item as Record<string, unknown>).transcriptionId;
  if (typeof transcriptionId !== 'string' || transcriptionId === '') {
    throw new MalformedTranscriptionRecordError('client session claim names no transcription');
  }

  return transcriptionId;
}

/**
 * Deliberately not a `DomainError`: `DomainErrorCode` is the closed union the
 * front end branches on exhaustively, and no client can act on schema drift.
 * The HTTP mapper turns anything unrecognised into a generic 500, which is the
 * right answer — what matters is that it arrives as a deliberate failure with
 * a stable `code` rather than as a `TypeError` thrown deep inside the entity.
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
  // Required rather than defaulted: a stored record without a version cannot
  // be written back safely, because every conditional write compares against
  // it. Defaulting to 0 would make each of those writes fail forever with no
  // explanation; failing the read names the problem where it can be seen.
  version: z.number().int().nonnegative(),
  fileName: z.string().min(1),
  source: z.enum(TRANSCRIPTION_SOURCES),
  status: z.enum(TRANSCRIPTION_STATUSES),
  // Nullable since an upload stopped declaring one: the attribute is written
  // on every record either way, so a record saved by the previous version —
  // carrying the language its uploader was asked for — still reads back, and
  // no migration is needed. It is the same nullable shape as `sizeBytes`.
  language: z.enum(SUPPORTED_TRANSCRIPTION_LANGUAGES).nullable(),
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
    version: primitives.version,
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
