import type { z } from 'zod';
import type { SpeechmaticsTranscriptSchema } from '../providers/speechmatics-callback.js';

export type SpeechmaticsTranscript = z.infer<typeof SpeechmaticsTranscriptSchema>;
