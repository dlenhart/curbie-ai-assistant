import type { ModelLoaderPort } from '../model/interfaces/model-loader-port.interface';

export class RecordingModelLoader implements ModelLoaderPort {
  readonly requestedModelNames: string[] = [];

  constructor(private readonly failure?: Error) {}

  async ensureLoaded(modelName: string): Promise<void> {
    this.requestedModelNames.push(modelName);
    if (this.failure !== undefined) throw this.failure;
  }
}
