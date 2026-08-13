import type { ProviderJobOutcome } from '../../domain/types/provider-job-outcome.js';

export type CompletedOutcome = Extract<ProviderJobOutcome, { kind: 'completed' }>;
