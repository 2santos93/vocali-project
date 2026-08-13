export interface ApiRequestOptions {
  readonly method: 'GET' | 'POST';
  readonly body?: Record<string, unknown>;
}

export type ApiRequester = (path: string, options: ApiRequestOptions) => Promise<unknown>;
