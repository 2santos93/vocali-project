import type { z } from 'zod';
import type {
  SpeechmaticsTranscriptSchema,
  TranscriptResultSchema,
} from '../providers/speechmatics-callback.js';

export interface SpeechmaticsRuntimeHooks {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly random: () => number;
}

export type SpeechmaticsTranscript = z.infer<typeof SpeechmaticsTranscriptSchema>;

export type TranscriptResult = z.infer<typeof TranscriptResultSchema>;
