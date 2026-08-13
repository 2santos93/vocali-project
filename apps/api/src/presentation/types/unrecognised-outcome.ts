import type { ProviderJobOutcome } from '../../domain/types/provider-job-outcome.js';

export type UnrecognisedOutcome = Extract<ProviderJobOutcome, { kind: 'unrecognised' }>;
