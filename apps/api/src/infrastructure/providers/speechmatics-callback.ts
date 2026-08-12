import { z } from 'zod';

/**
 * The provider appends `?id=<jobId>&status=<status>` to whatever callback URL
 * the job was submitted with. `success` is the only value that means a
 * transcript is in the body; every other value describes a job that produced
 * none.
 */
export const SPEECHMATICS_SUCCESS_STATUS = 'success';

/**
 * The transcript as the provider posts it when `contents` names a single
 * entry: its own JSON output format, straight in the request body.
 *
 * Deliberately loose. Every field the platform does not read is left
 * undeclared and every field it does read is optional, because this schema
 * describes somebody else's payload and a provider adding a field, or
 * omitting one on an empty recording, must not turn a finished transcription
 * into a rejected callback. What is enforced is the shape of the parts that
 * are actually used.
 */
const TranscriptResultSchema = z.object({
  type: z.string().optional(),
  attaches_to: z.string().optional(),
  end_time: z.number().optional(),
  alternatives: z.array(z.object({ content: z.string() })).optional(),
});

export const SpeechmaticsTranscriptSchema = z.object({
  job: z.object({ duration: z.number().nonnegative().optional() }).optional(),
  results: z.array(TranscriptResultSchema).default([]),
});

export type SpeechmaticsTranscript = z.infer<typeof SpeechmaticsTranscriptSchema>;

type TranscriptResult = z.infer<typeof TranscriptResultSchema>;

/**
 * Flattens the provider's token list into the plain text the platform stores
 * and shows.
 *
 * Spacing is the whole job. Words are separated by a space; punctuation is
 * not, and Spanish makes that a real requirement rather than a nicety —
 * `¿` and `¡` open a sentence and carry `attaches_to: "next"`, so they take a
 * space before and none after, while `?`, `!`, `.` and `,` take the opposite.
 * Joining every token with a space produces `el paciente refiere dolor .`,
 * which is what a clinician would be asked to sign.
 *
 * The first alternative is the provider's own best guess; the rest are
 * lower-confidence candidates and are not the transcript. A token with no
 * alternatives at all — a speaker change marker, for instance — contributes
 * nothing and must not contribute a space either.
 */
export function buildTranscriptText(results: readonly TranscriptResult[]): string {
  let text = '';
  let previousAttachesToNext = false;

  for (const result of results) {
    const content = result.alternatives?.[0]?.content;
    if (content === undefined || content === '') continue;

    const attachesToPrevious =
      result.attaches_to === 'previous' ||
      (result.type === 'punctuation' && result.attaches_to === undefined);
    const separator = text === '' || previousAttachesToNext || attachesToPrevious ? '' : ' ';

    text += `${separator}${content}`;
    previousAttachesToNext = result.attaches_to === 'next';
  }

  return text;
}

/**
 * The audio's length in seconds, as the provider measured it.
 *
 * `job.duration` is the authoritative value, but it is absent on some job
 * shapes, so the last token's end time stands in — it is the end of the
 * transcript rather than the end of the file, and slightly short is better
 * than a record that displays no duration at all. Zero is the floor: the
 * entity requires a non-negative number, and an empty recording genuinely
 * has no length.
 */
export function resolveDurationSeconds(transcript: SpeechmaticsTranscript): number {
  const reported = transcript.job?.duration;
  if (reported !== undefined) return reported;

  const endTimes = transcript.results
    .map((result) => result.end_time)
    .filter((endTime): endTime is number => endTime !== undefined);

  return endTimes.length === 0 ? 0 : Math.max(...endTimes);
}
