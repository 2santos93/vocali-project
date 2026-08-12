import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CompleteTranscription } from './application/use-cases/complete-transcription.js';
import { CreateAudioUploadIntent } from './application/use-cases/create-audio-upload-intent.js';
import { CreateRealtimeSession } from './application/use-cases/create-realtime-session.js';
import { FailTranscription } from './application/use-cases/fail-transcription.js';
import { GetTranscription } from './application/use-cases/get-transcription.js';
import { GetTranscriptionDownloadUrl } from './application/use-cases/get-transcription-download-url.js';
import { ListUserTranscriptions } from './application/use-cases/list-user-transcriptions.js';
import { SaveRealtimeTranscription } from './application/use-cases/save-realtime-transcription.js';
import { StartFileTranscription } from './application/use-cases/start-file-transcription.js';
import type { Logger } from './domain/ports/logger.js';
import type { SecretsProvider } from './domain/ports/secrets-provider.js';
import { loadConfig, type AppConfig } from './infrastructure/config/environment.js';
import { UlidIdGenerator } from './infrastructure/id/ulid-id-generator.js';
import { createLogger } from './infrastructure/logging/pino-logger.js';
import { DynamoTranscriptionRepository } from './infrastructure/persistence/dynamo-transcription-repository.js';
import { SpeechmaticsTranscriptionProvider } from './infrastructure/providers/speechmatics-transcription-provider.js';
import { SsmSecretsProvider } from './infrastructure/secrets/ssm-secrets-provider.js';
import { S3FileStorage } from './infrastructure/storage/s3-file-storage.js';
import { SystemClock } from './infrastructure/time/system-clock.js';

/**
 * Everything a handler is allowed to reach for. Use cases and the two
 * cross-cutting services they cannot express — the logger, and the secret the
 * webhook authenticates against — and no adapters: a handler that could see
 * `S3Client` would eventually use it.
 */
export interface Container {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly secrets: SecretsProvider;
  readonly createAudioUploadIntent: CreateAudioUploadIntent;
  readonly listUserTranscriptions: ListUserTranscriptions;
  readonly getTranscription: GetTranscription;
  readonly getTranscriptionDownloadUrl: GetTranscriptionDownloadUrl;
  readonly saveRealtimeTranscription: SaveRealtimeTranscription;
  readonly createRealtimeSession: CreateRealtimeSession;
  readonly startFileTranscription: StartFileTranscription;
  readonly completeTranscription: CompleteTranscription;
  readonly failTranscription: FailTranscription;
}

/**
 * One graph per container, not one per request.
 *
 * A Lambda execution environment serves many invocations from one module
 * evaluation. Building the graph inside the handler would create three AWS
 * SDK clients on every call — each with its own connection pool, credential
 * resolution and region lookup — and would throw away the secret cache that
 * makes a warm invocation avoid Parameter Store entirely. Holding it here
 * means the second request through a container pays for none of that.
 *
 * The entry points in `src/lambda/` call this at module scope, so it runs
 * during initialisation. That is also where `loadConfig` belongs: a missing
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

  // Two buckets, two adapters, and which one a use case receives is a
  // decision made here and nowhere else. `FileStorage` carries an object key
  // and no bucket, so a use case cannot tell which store it was handed — and
  // the execution roles grant `s3:PutObject` on the transcripts bucket alone,
  // so a transcript writer holding the audio adapter is denied at the moment
  // it writes, after the provider has already done the work.
  const audioStorage = new S3FileStorage(s3, config.audioBucketName, clock);
  const transcriptsStorage = new S3FileStorage(s3, config.transcriptsBucketName, clock);
  const repository = new DynamoTranscriptionRepository(dynamo, config.transcriptionsTableName);
  const secrets = new SsmSecretsProvider(ssm);
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
  };
}

/** Test seam: the memoised graph outlives a test file otherwise, as it is meant to. */
export function resetContainer(): void {
  container = undefined;
}
