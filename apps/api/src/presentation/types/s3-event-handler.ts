import type { S3ObjectCreatedEvent } from './s3-object-created-event.js';

export type S3EventHandler = (event: S3ObjectCreatedEvent) => Promise<void>;
