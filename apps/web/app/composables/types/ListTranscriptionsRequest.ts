/**
 * A collaborator rather than a direct call, so the pagination rules can be
 * driven under Jest with no server. Resolves to `unknown` on purpose: what
 * comes back has crossed a trust boundary and is parsed, not asserted.
 */
export type ListTranscriptionsRequest = (cursor: string | null) => Promise<unknown>;
