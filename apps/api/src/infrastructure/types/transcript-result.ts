import type { z } from 'zod';
import type { TranscriptResultSchema } from '../providers/speechmatics-callback.js';

export type TranscriptResult = z.infer<typeof TranscriptResultSchema>;
