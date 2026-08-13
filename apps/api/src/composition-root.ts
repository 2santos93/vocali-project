import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CompleteTranscription } from './application/use-cases/complete-transcription.js';
import { CreateAudioUploadIntent } from './application/use-cases/create-audio-upload-intent.js';
import { CreateRealtimeSession } from './application/use-cases/create-realtime-session.js';
import { DeregisterConnection } from './application/use-cases/deregister-connection.js';
import { FailTranscription } from './application/use-cases/fail-transcription.js';
import { GetTranscription } from './application/use-cases/get-transcription.js';
import { GetTranscriptionDownloadUrl } from './application/use-cases/get-transcription-download-url.js';
import { IssueConnectionTicket } from './application/use-cases/issue-connection-ticket.js';
import { ListUserTranscriptions } from './application/use-cases/list-user-transcriptions.js';
import { PublishTranscriptionUpdate } from './application/use-cases/publish-transcription-update.js';
import { RedeemConnectionTicket } from './application/use-cases/redeem-connection-ticket.js';
import { RegisterConnection } from './application/use-cases/register-connection.js';
import { SaveRealtimeTranscription } from './application/use-cases/save-realtime-transcription.js';
import { StartFileTranscription } from './application/use-cases/start-file-transcription.js';
import { loadConfig } from './infrastructure/config/environment.js';
import type { AppConfig } from './infrastructure/types/app-config.js';
import type { Container } from './types/container.js';
import { CryptoTokenGenerator } from './infrastructure/id/crypto-token-generator.js';
import { UlidIdGenerator } from './infrastructure/id/ulid-id-generator.js';
import { ApiGatewayConnectionPublisher } from './infrastructure/messaging/api-gateway-connection-publisher.js';
import { createLogger } from './infrastructure/logging/pino-logger.js';
import { DynamoConnectionRegistry } from './infrastructure/persistence/dynamo-connection-registry.js';
import { DynamoConnectionTicketStore } from './infrastructure/persistence/dynamo-connection-ticket-store.js';
import { DynamoTranscriptionRepository } from './infrastructure/persistence/dynamo-transcription-repository.js';
import { SpeechmaticsTranscriptionProvider } from './infrastructure/providers/speechmatics-transcription-provider.js';
import { SsmSecretsProvider } from './infrastructure/secrets/ssm-secrets-provider.js';
import { S3FileStorage } from './infrastructure/storage/s3-file-storage.js';
import { SystemClock } from './infrastructure/time/system-clock.js';

/**
 * One graph per container, not one per request. Building it inside the handler
 * would create three AWS SDK clients on every call and throw away the secret
 * cache that lets a warm invocation avoid Parameter Store entirely.
 *
 * The entry points call this at module scope, so it runs during
 * initialisation. That is also where `loadConfig` belongs: a missing
 * environment variable then fails the container's init, naming the variable,
 * instead of surfacing as a 500 on some user's first upload.
 */
let container: Container | undefined;

export function getContainer(): Container {
  container ??= buildContainer(loadConfig());

  return container;
}

/** Exported so a test can build a graph from a configuration it controls. */
export function buildContainer(config: AppConfig): Container {
  const clock = new SystemClock();
  const idGenerator = new UlidIdGenerator();
  const logger = createLogger({ level: config.logLevel });

  const s3 = new S3Client({ region: config.region });
  const ssm = new SSMClient({ region: config.region });
  // The document client marshals plain JavaScript values, so the mapper deals
  // in `string | null` rather than in `{ S: ... }` and `{ NULL: true }`.
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }));

  // Which bucket a use case receives is decided here and nowhere else:
  // `FileStorage` carries an object key and no bucket, so a use case cannot
  // tell which store it was handed. The roles grant `s3:PutObject` on the
  // transcripts bucket alone, so a transcript writer holding the audio adapter
  // is denied at the moment it writes, after the provider has done the work.
  const audioStorage = new S3FileStorage(s3, config.audioBucketName, clock);
  const transcriptsStorage = new S3FileStorage(s3, config.transcriptsBucketName, clock);
  const repository = new DynamoTranscriptionRepository(dynamo, config.transcriptionsTableName);
  const secrets = new SsmSecretsProvider(ssm);
  // The one AWS client whose endpoint is not derived from the region alone:
  // without this the SDK addresses the service's default endpoint and every
  // publish answers 404 for a connection that is open.
  const connectionPublisher = new ApiGatewayConnectionPublisher(
    new ApiGatewayManagementApiClient({
      region: config.region,
      endpoint: config.websocketManagementEndpoint,
    }),
  );
  const connections = new DynamoConnectionRegistry(dynamo, config.transcriptionsTableName);
  const connectionTickets = new DynamoConnectionTicketStore(dynamo, config.transcriptionsTableName);
  const provider = new SpeechmaticsTranscriptionProvider(
    secrets,
    clock,
    logger,
    config.speechmatics,
  );

  return {
    config,
    logger,
    secrets,
    transcriptionProvider: provider,
    createAudioUploadIntent: new CreateAudioUploadIntent(
      repository,
      audioStorage,
      idGenerator,
      clock,
    ),
    listUserTranscriptions: new ListUserTranscriptions(repository),
    getTranscription: new GetTranscription(repository),
    getTranscriptionDownloadUrl: new GetTranscriptionDownloadUrl(
      repository,
      transcriptsStorage,
      clock,
    ),
    saveRealtimeTranscription: new SaveRealtimeTranscription(
      repository,
      transcriptsStorage,
      idGenerator,
      clock,
    ),
    createRealtimeSession: new CreateRealtimeSession(provider),
    startFileTranscription: new StartFileTranscription(
      repository,
      audioStorage,
      provider,
      clock,
      logger,
      {
        callbackBaseUrl: config.providerCallbackBaseUrl,
      },
    ),
    completeTranscription: new CompleteTranscription(repository, transcriptsStorage, clock),
    failTranscription: new FailTranscription(repository, clock),
    issueConnectionTicket: new IssueConnectionTicket(
      connectionTickets,
      new CryptoTokenGenerator(),
      clock,
      { websocketUrl: config.websocketUrl },
    ),
    redeemConnectionTicket: new RedeemConnectionTicket(connectionTickets, clock),
    registerConnection: new RegisterConnection(connections, clock),
    deregisterConnection: new DeregisterConnection(connections),
    publishTranscriptionUpdate: new PublishTranscriptionUpdate(
      repository,
      connections,
      connectionPublisher,
      logger,
    ),
  };
}

/** Test seam: the memoised graph outlives a test file otherwise, as it is meant to. */
export function resetContainer(): void {
  container = undefined;
}
