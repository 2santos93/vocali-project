import type { TranscriptionPrimitives } from './transcription-primitives.js';

export interface TranscriptionPage {
  readonly items: readonly TranscriptionPrimitives[];
  readonly nextCursor: string | null;
}
