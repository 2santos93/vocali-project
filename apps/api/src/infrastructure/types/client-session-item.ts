import type { TranscriptionKey } from './transcription-key.js';

export type ClientSessionItem = TranscriptionKey & { readonly transcriptionId: string };
