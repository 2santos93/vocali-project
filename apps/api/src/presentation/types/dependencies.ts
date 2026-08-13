import type { CreateAudioUploadIntent } from '../../application/use-cases/create-audio-upload-intent.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { StartFileTranscription } from '../../application/use-cases/start-file-transcription.js';
import type { GetTranscription } from '../../application/use-cases/get-transcription.js';
import type { ListUserTranscriptions } from '../../application/use-cases/list-user-transcriptions.js';
import type { GetTranscriptionDownloadUrl } from '../../application/use-cases/get-transcription-download-url.js';
import type { SaveRealtimeTranscription } from '../../application/use-cases/save-realtime-transcription.js';
import type { CreateRealtimeSession } from '../../application/use-cases/create-realtime-session.js';
import type { IssueConnectionTicket } from '../../application/use-cases/issue-connection-ticket.js';
import type { RedeemConnectionTicket } from '../../application/use-cases/redeem-connection-ticket.js';
import type { RegisterConnection } from '../../application/use-cases/register-connection.js';
import type { DeregisterConnection } from '../../application/use-cases/deregister-connection.js';
import type { CompleteTranscription } from '../../application/use-cases/complete-transcription.js';
import type { FailTranscription } from '../../application/use-cases/fail-transcription.js';
import type { PublishTranscriptionUpdate } from '../../application/use-cases/publish-transcription-update.js';
import type { SecretsProvider } from '../../domain/ports/secrets-provider.js';
import type { TranscriptionProvider } from '../../domain/ports/transcription-provider.js';

export interface CreateUploadIntentDependencies {
  readonly useCase: CreateAudioUploadIntent;
  readonly logger: Logger;
}

export interface StartTranscriptionJobDependencies {
  readonly useCase: StartFileTranscription;
  readonly logger: Logger;
}

export interface GetTranscriptionDependencies {
  readonly useCase: GetTranscription;
  readonly logger: Logger;
}

export interface ListTranscriptionsDependencies {
  readonly useCase: ListUserTranscriptions;
  readonly logger: Logger;
}

export interface GetTranscriptionDownloadUrlDependencies {
  readonly useCase: GetTranscriptionDownloadUrl;
  readonly logger: Logger;
}

export interface SaveRealtimeTranscriptionDependencies {
  readonly useCase: SaveRealtimeTranscription;
  readonly logger: Logger;
}

export interface CreateRealtimeSessionDependencies {
  readonly useCase: CreateRealtimeSession;
  readonly logger: Logger;
}

export interface CreateConnectionTicketDependencies {
  readonly useCase: IssueConnectionTicket;
  readonly logger: Logger;
}

export interface AuthorizeConnectionDependencies {
  readonly redeemConnectionTicket: RedeemConnectionTicket;
  readonly logger: Logger;
}

export interface HandleConnectionOpenedDependencies {
  readonly registerConnection: RegisterConnection;
  readonly logger: Logger;
}

export interface HandleConnectionClosedDependencies {
  readonly deregisterConnection: DeregisterConnection;
  readonly logger: Logger;
}

export interface HandleProviderCallbackDependencies {
  readonly completeTranscription: CompleteTranscription;
  readonly failTranscription: FailTranscription;
  readonly publishTranscriptionUpdate: PublishTranscriptionUpdate;
  readonly transcriptionProvider: TranscriptionProvider;
  readonly secrets: SecretsProvider;
  /** Parameter Store path of the shared secret the provider echoes back. */
  readonly webhookSecretName: string;
  readonly logger: Logger;
}
