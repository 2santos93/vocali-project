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

const MAX_PARAMETER_LENGTH = 128;

export const TranscriptResultSchema = z.object({
  type: z.string().optional(),
  attaches_to: z.string().optional(),
  end_time: z.number().optional(),
  /** Reported per token rather than once per job; see `resolveDetectedLanguage`. */
  language: z.string().optional(),
  alternatives: z.array(z.object({ content: z.string() })).optional(),
});

export const SpeechmaticsTranscriptSchema = z.object({
  job: z.object({ duration: z.number().nonnegative().optional() }).optional(),
  results: z.array(TranscriptResultSchema).default([]),
});

export function interpretSpeechmaticsCallback(callback: ProviderCallback): ProviderJobOutcome {
  const externalJobId = readParameter(callback.query, JOB_ID_PARAMETER);
  if (externalJobId === null) {
    return { kind: 'unrecognised', reason: 'The callback did not name a provider job' };
  }

  const providerStatus = readParameter(callback.query, STATUS_PARAMETER);
  if (providerStatus === null) {
    return { kind: 'unrecognised', reason: 'The callback did not report a job status' };
  }

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

export function resolveDurationSeconds(transcript: SpeechmaticsTranscript): number {
  const reported = transcript.job?.duration;
  if (reported !== undefined) return reported;

  const endTimes = transcript.results
    .map((result) => result.end_time)
    .filter((endTime): endTime is number => endTime !== undefined);

  return endTimes.length === 0 ? 0 : Math.max(...endTimes);
}
