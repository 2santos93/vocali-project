import type { RealtimeSessionResponse } from '@vocali/contracts';
import type { TranscriptionProvider } from '../../domain/ports/transcription-provider.js';

/** Kept short: the credential is exchanged for a websocket connection immediately after issuance. */
const REALTIME_SESSION_TTL_SECONDS = 60;

/** The platform's microphone capture format; not negotiable per session. */
const REALTIME_AUDIO_FORMAT = {
  type: 'raw',
  encoding: 'pcm_s16le',
  sampleRate: 16_000,
} as const;

export class CreateRealtimeSession {
  constructor(private readonly provider: TranscriptionProvider) {}

  async execute(): Promise<RealtimeSessionResponse> {
    const credentials = await this.provider.createRealtimeCredentials({
      ttlSeconds: REALTIME_SESSION_TTL_SECONDS,
    });

    return {
      token: credentials.token,
      websocketUrl: credentials.websocketUrl,
      expiresAt: credentials.expiresAt.toISOString(),
      audioFormat: REALTIME_AUDIO_FORMAT,
    };
  }
}
