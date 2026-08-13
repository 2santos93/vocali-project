import type { CompleteTranscription } from '../application/use-cases/complete-transcription.js';
import type { CreateAudioUploadIntent } from '../application/use-cases/create-audio-upload-intent.js';
import type { CreateRealtimeSession } from '../application/use-cases/create-realtime-session.js';
import type { DeregisterConnection } from '../application/use-cases/deregister-connection.js';
import type { FailTranscription } from '../application/use-cases/fail-transcription.js';
import type { GetTranscription } from '../application/use-cases/get-transcription.js';
import type { GetTranscriptionDownloadUrl } from '../application/use-cases/get-transcription-download-url.js';
import type { IssueConnectionTicket } from '../application/use-cases/issue-connection-ticket.js';
import type { ListUserTranscriptions } from '../application/use-cases/list-user-transcriptions.js';
import type { PublishTranscriptionUpdate } from '../application/use-cases/publish-transcription-update.js';
import type { RedeemConnectionTicket } from '../application/use-cases/redeem-connection-ticket.js';
import type { RegisterConnection } from '../application/use-cases/register-connection.js';
import type { SaveRealtimeTranscription } from '../application/use-cases/save-realtime-transcription.js';
import type { StartFileTranscription } from '../application/use-cases/start-file-transcription.js';
import type { Logger } from '../domain/ports/logger.js';
import type { SecretsProvider } from '../domain/ports/secrets-provider.js';
import type { TranscriptionProvider } from '../domain/ports/transcription-provider.js';
import type { AppConfig } from '../infrastructure/types/app-config.js';

/**
 * Everything a handler is allowed to reach for, declared as ports. That is what
 * keeps this list from becoming a way in for adapters: a handler that could see
 * `S3Client` would eventually use it, and naming
 * `SpeechmaticsTranscriptionProvider` here would put one vendor back inside the
 * HTTP layer.
 */
export interface Container {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly secrets: SecretsProvider;
  readonly transcriptionProvider: TranscriptionProvider;
  readonly createAudioUploadIntent: CreateAudioUploadIntent;
  readonly listUserTranscriptions: ListUserTranscriptions;
  readonly getTranscription: GetTranscription;
  readonly getTranscriptionDownloadUrl: GetTranscriptionDownloadUrl;
  readonly saveRealtimeTranscription: SaveRealtimeTranscription;
  readonly createRealtimeSession: CreateRealtimeSession;
  readonly startFileTranscription: StartFileTranscription;
  readonly completeTranscription: CompleteTranscription;
  readonly failTranscription: FailTranscription;
  readonly issueConnectionTicket: IssueConnectionTicket;
  readonly redeemConnectionTicket: RedeemConnectionTicket;
  readonly registerConnection: RegisterConnection;
  readonly deregisterConnection: DeregisterConnection;
  readonly publishTranscriptionUpdate: PublishTranscriptionUpdate;
}
