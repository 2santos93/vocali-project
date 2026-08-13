import type { z } from 'zod';
import type { ProviderCallbackQuerySchema } from '../handlers/handle-provider-callback.js';
import type { ProviderJobOutcome } from '../../domain/types/provider.js';

export interface S3ObjectCreatedEvent {
  readonly Records: readonly {
    readonly s3: { readonly object: { readonly key: string } };
  }[];
}

export type S3EventHandler = (event: S3ObjectCreatedEvent) => Promise<void>;

export type CallbackQuery = z.infer<typeof ProviderCallbackQuerySchema>;

export type CompletedOutcome = Extract<ProviderJobOutcome, { kind: 'completed' }>;

export type FailedOutcome = Extract<ProviderJobOutcome, { kind: 'failed' }>;

export type UnrecognisedOutcome = Extract<ProviderJobOutcome, { kind: 'unrecognised' }>;
