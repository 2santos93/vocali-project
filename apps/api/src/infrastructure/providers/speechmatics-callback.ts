import { SUPPORTED_TRANSCRIPTION_LANGUAGES } from '@vocali/contracts/constants';
import type { TranscriptionLanguage } from '@vocali/contracts/constants';
import { z } from 'zod';
import type { ProviderCallback, ProviderJobOutcome } from '../../domain/types/provider.js';
import type { SpeechmaticsTranscript, TranscriptResult } from '../types/speechmatics.js';

/**
 * The provider appends `?id=<jobId>&status=<status>` to the callback URL the
 * job was submitted with.
 */
const JOB_ID_PARAMETER = 'id';
const STATUS_PARAMETER = 'status';
const SPEECHMATICS_SUCCESS_STATUS = 'success';

/**
 * Both values travel onward — the job id into a storage comparison, the status
 * into a log line — so both are bounded at the edge rather than trusted because
 * the caller knew the shared secret.
 */
const MAX_PARAMETER_LENGTH = 128;

/**
 * Deliberately loose: this describes somebody else's payload, so a provider
 * adding a field, or omitting one on an empty recording, must not turn a
 * finished transcription into a rejected callback.
 */
export const TranscriptResultSchema = z.object({
  type: z.string().optional(),
  attaches_to: z.string().optional(),
  end_time: z.number().optional(),
  /** Reported per token rather than once per job — see `resolveDetectedLanguage`. */
  language: z.string().optional(),
  alternatives: z.array(z.object({ content: z.string() })).optional(),
});

export const SpeechmaticsTranscriptSchema = z.object({
  job: z.object({ duration: z.number().nonnegative().optional() }).optional(),
  results: z.array(TranscriptResultSchema).default([]),
});

/**
 * An unusable job id is `unrecognised` rather than `failed`, even where the
 * callback reports a real failure: the id is what proves the callback belongs
 * to the record it names, and marking a transcription failed on a callback
 * that cannot be tied to it is a write the sender did not earn.
 */
export function interpretSpeechmaticsCallback(callback: ProviderCallback): ProviderJobOutcome {
  const externalJobId = readParameter(callback.query, JOB_ID_PARAMETER);
  if (externalJobId === null) {
    return { kind: 'unrecognised', reason: 'The callback did not name a provider job' };
  }

  const providerStatus = readParameter(callback.query, STATUS_PARAMETER);
  if (providerStatus === null) {
    return { kind: 'unrecognised', reason: 'The callback did not report a job status' };
  }

  // Read this way round on purpose: a status the provider adds later becomes a
  // failure, which FAILED -> COMPLETED lets a later callback recover from,
  // whereas guessing the other way completes a transcription out of whatever
  // the body happened to hold.
  if (providerStatus !== SPEECHMATICS_SUCCESS_STATUS) {
    return { kind: 'failed', externalJobId, providerStatus };
  }

  const transcript = readTranscript(callback.body);
  if (transcript === null) {
    return { kind: 'unrecognised', reason: 'The callback body is not a transcript' };
  }

  return {
    kind: 'completed',
    externalJobId,
    text: buildTranscriptText(transcript.results),
    durationSeconds: resolveDurationSeconds(transcript),
    language: resolveDetectedLanguage(transcript),
  };
}

/**
 * An unrecognised code is read as "not known" rather than forced into the
 * union: the alternative is a stored language the rest of the system cannot
 * render. The first token carrying one decides it — a file is submitted as a
 * single-language job, so the tokens agree.
 */
export function resolveDetectedLanguage(
  transcript: SpeechmaticsTranscript,
): TranscriptionLanguage | null {
  for (const result of transcript.results) {
    const reported = result.language;
    if (reported !== undefined && isSupportedLanguage(reported)) {
      return reported;
    }
  }

  return null;
}

function isSupportedLanguage(value: string): value is TranscriptionLanguage {
  return (SUPPORTED_TRANSCRIPTION_LANGUAGES as readonly string[]).includes(value);
}

function readParameter(
  query: Readonly<Record<string, string | undefined>>,
  name: string,
): string | null {
  const value = query[name];

  return value === undefined || value === '' || value.length > MAX_PARAMETER_LENGTH ? null : value;
}

/**
 * An absent body is read as an empty payload rather than refused: a success
 * callback carrying nothing records an empty recording instead of being
 * rejected and redelivered until the provider gives up.
 */
function readTranscript(body: string | undefined): SpeechmaticsTranscript | null {
  let payload: unknown = {};

  if (body !== undefined && body !== '') {
    try {
      payload = JSON.parse(body);
    } catch {
      return null;
    }
  }

  const parsed = SpeechmaticsTranscriptSchema.safeParse(payload);

  return parsed.success ? parsed.data : null;
}

/**
 * Spacing is the whole job, and Spanish makes it a requirement rather than a
 * nicety: `¿` and `¡` carry `attaches_to: "next"`, so they take a space before
 * and none after, while `?`, `!`, `.` and `,` take the opposite. Joining every
 * token with a space produces `el paciente refiere dolor .`, which is what a
 * clinician would be asked to sign.
 *
 * Only the first alternative is the transcript; the rest are lower-confidence
 * candidates. A token with none — a speaker change marker — must not
 * contribute a space either.
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
 * `job.duration` is authoritative but absent on some job shapes, so the last
 * token's end time stands in — the end of the transcript rather than of the
 * file, and slightly short beats a record showing no duration at all.
 */
export function resolveDurationSeconds(transcript: SpeechmaticsTranscript): number {
  const reported = transcript.job?.duration;
  if (reported !== undefined) return reported;

  const endTimes = transcript.results
    .map((result) => result.end_time)
    .filter((endTime): endTime is number => endTime !== undefined);

  return endTimes.length === 0 ? 0 : Math.max(...endTimes);
}
