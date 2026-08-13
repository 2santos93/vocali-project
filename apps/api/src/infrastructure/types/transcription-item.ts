import type { TranscriptionPrimitives } from '../../domain/types/transcription-primitives.js';
import type { TranscriptionKey } from './transcription-key.js';

export type TranscriptionItem = TranscriptionKey & TranscriptionPrimitives;
