import { SUPPORTED_TRANSCRIPTION_LANGUAGES } from '@vocali/contracts/constants';
import type { TranscriptionLanguage } from '@vocali/contracts/constants';
import { z } from 'zod';
import type {
  ProviderCallback,
  ProviderJobOutcome,
} from '../../domain/ports/transcription-provider.js';

/**
 * The provider appends `?id=<jobId>&status=<status>` to whatever callback URL
 * the job was submitted with. `success` is the only value that means a
 * transcript is in the body; every other value describes a job that produced
 * none.
 */
const JOB_ID_PARAMETER = 'id';
const STATUS_PARAMETER = 'status';
const SPEECHMATICS_SUCCESS_STATUS = 'success';

/**
 * Both values travel onward — the job id into a storage comparison, the status
 * into a log line — so both are bounded here, at the edge, rather than trusted
 * because they came from a caller that knew the shared secret.
 */
const MAX_PARAMETER_LENGTH = 128;

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
  /**
   * Where the identified language arrives. Speechmatics reports it per token
   * rather than once per job, so the transcript carries it on the words
   * themselves — see `resolveDetectedLanguage`.
   */
  language: z.string().optional(),
  alternatives: z.array(z.object({ content: z.string() })).optional(),
});

export const SpeechmaticsTranscriptSchema = z.object({
  job: z.object({ duration: z.number().nonnegative().optional() }).optional(),
  results: z.array(TranscriptResultSchema).default([]),
});

export type SpeechmaticsTranscript = z.infer<typeof SpeechmaticsTranscriptSchema>;

type TranscriptResult = z.infer<typeof TranscriptResultSchema>;

/**
 * Everything this platform needs to know about a Speechmatics callback, and
 * the only place that knowledge lives.
 *
 * An unusable job id is `unrecognised` rather than `failed`, even though the
 * callback may well be reporting a real failure: the id is what proves the
 * callback belongs to the record it names, and marking a transcription failed
 * on a callback that cannot be tied to it is a write the sender did not earn.
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

  // Anything other than the one success word is a job that produced no
  // transcript. Read this way round on purpose: a status the provider adds
  // later becomes a failure, which ruling R2 allows a later completion to
  // recover from, where guessing the other way would complete a transcription
  // out of whatever the body happened to hold.
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
 * The language the provider identified, as this platform names it.
 *
 * The job was submitted with the platform's five languages as the only
 * candidates, so what comes back should always be one of them — but this is
 * somebody else's payload, and a code we do not recognise is read as "not
 * known" rather than forced into the union. The alternative is a stored
 * language the rest of the system cannot render.
 *
 * The first token that carries one decides it. A file is submitted as a single
 * language job, so the tokens agree; taking the first avoids counting votes to
 * answer a question the provider has already answered.
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
 * An absent body is read as an empty payload rather than refused, for the same
 * reason the schema above is loose: `results` defaults, so a success callback
 * that carried nothing records an empty recording instead of being rejected
 * and redelivered until the provider gives up.
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
