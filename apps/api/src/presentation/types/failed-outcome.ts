import type { ProviderJobOutcome } from '../../domain/types/provider-job-outcome.js';

export type FailedOutcome = Extract<ProviderJobOutcome, { kind: 'failed' }>;
