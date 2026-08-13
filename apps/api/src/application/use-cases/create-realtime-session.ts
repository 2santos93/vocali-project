import { REALTIME_AUDIO_FORMAT } from '@vocali/contracts/constants';
import type { RealtimeSessionResponse } from '@vocali/contracts';
import type { TranscriptionProvider } from '../../domain/ports/transcription-provider.js';
import { REALTIME_SESSION_TTL_SECONDS } from '../constants.js';

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
