export interface ModelCatalogPort {
  listInstalledModelNames(): Promise<readonly string[]>;
}
