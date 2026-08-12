import { TranscriptFormatSchema } from '@vocali/contracts';
import { z } from 'zod';

/**
 * A bound, not a format check. Ids are ULIDs and so 26 characters, but the
 * only thing that matters here is that an unbounded caller-supplied string
 * never travels into a DynamoDB sort key. Pinning the exact ULID shape would
 * couple the URL to the id scheme for no gain: a wrong-but-well-formed id
 * already resolves to nothing.
 */
const MAX_TRANSCRIPTION_ID_LENGTH = 64;

export const TranscriptionPathParametersSchema = z.object({
  transcriptionId: z.string().min(1).max(MAX_TRANSCRIPTION_ID_LENGTH),
});

/**
 * Built from the shared `TranscriptFormatSchema` rather than restating the
 * formats, so the query string and the response body can never disagree about
 * which ones exist. `txt` is the default because it is what the download
 * button asks for; `json` is for the client that wants timings.
 */
export const DownloadUrlQuerySchema = z.object({
  format: TranscriptFormatSchema.default('txt'),
});
