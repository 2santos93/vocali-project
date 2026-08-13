/**
 * `settled` means the outcome is known — transcribed or failed. `waiting`
 * means the budget ran out with the record still being worked on, which is not
 * an error and must not be reported as one.
 */
export type SettlementOutcome = 'settled' | 'waiting';
