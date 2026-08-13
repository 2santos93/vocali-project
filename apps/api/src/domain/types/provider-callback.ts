/**
 * A callback exactly as it arrived, with only the transport encoding removed.
 * Nothing here is interpreted: which parameter names a job and what the body
 * holds are the provider's decisions, so reading them belongs to its adapter.
 */
export interface ProviderCallback {
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly body: string | undefined;
}
