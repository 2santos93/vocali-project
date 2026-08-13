export interface RouteRedirect {
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
}
