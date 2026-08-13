/**
 * `fetch` is injected rather than reached for as a global because Jest runs
 * each file in its own VM realm: a `MockAgent` dispatcher installed inside
 * that realm is invisible to the `fetch` Node injected from the outer one, so
 * requests would quietly leave the machine. Passing it in makes "no test
 * touches the network" a property of the wiring.
 */
export interface SpeechmaticsRuntimeHooks {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly random: () => number;
}
