import {
  SUPPORTED_TRANSCRIPTION_LANGUAGES,
  TRANSCRIPTION_SOURCES,
  TRANSCRIPTION_STATUSES,
} from '@vocali/contracts/constants';
import { z } from 'zod';
import type { TranscriptionPrimitives } from '../../domain/types/transcription.js';
import type { ClientSessionItem, TranscriptionItem } from '../types/dynamo-items.js';

/** `PK = USER#<userId>`, `SK = TRANS#<transcriptionId>`. */
export const PARTITION_KEY_PREFIX = 'USER#';
export const TRANSCRIPTION_SORT_KEY_PREFIX = 'TRANS#';
export const CLIENT_SESSION_SORT_KEY_PREFIX = 'IDEM#';

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
 * Refuses a drifted claim item rather than returning a plausible id, which
 * would resolve a retry onto whatever record that value names.
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

export class MalformedTranscriptionRecordError extends Error {
  readonly code = 'MALFORMED_PERSISTED_RECORD';

  constructor(reason: string) {
    super(`Stored transcription record is malformed: ${reason}`);
    this.name = 'MalformedTranscriptionRecordError';
  }
}

const StoredTranscriptionSchema: z.ZodType<TranscriptionPrimitives> = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  version: z.number().int().nonnegative(),
  fileName: z.string().min(1),
  source: z.enum(TRANSCRIPTION_SOURCES),
  status: z.enum(TRANSCRIPTION_STATUSES),
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
    // The reasons name the offending attributes and nothing else: the record's
    // own values are clinical data and must not travel into a log line.
    const reasons = parsed.error.issues
      .map((issue) => `${issue.path.join('.')} (${issue.code})`)
      .join(', ');
    throw new MalformedTranscriptionRecordError(reasons);
  }

  return parsed.data;
}
