export interface OriginCheckInput {
  readonly host: string | undefined;
  readonly origin: string | undefined;
  readonly method: string | undefined;
  readonly secFetchSite: string | undefined;
}
