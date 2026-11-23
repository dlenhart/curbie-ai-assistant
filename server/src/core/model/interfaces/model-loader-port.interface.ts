export interface ModelLoaderPort {
  ensureLoaded(modelName: string): Promise<void>;
}
