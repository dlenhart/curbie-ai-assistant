import type { ModelLoaderPort } from './interfaces/model-loader-port.interface';
import type { ModelPort } from './interfaces/model-port.interface';
import type { ModelRequest } from './interfaces/model-request.interface';
import type { ModelResponse } from './interfaces/model-response.interface';

export class ModelLoadingDecorator implements ModelPort {
  constructor(
    private readonly loader: ModelLoaderPort,
    private readonly inner: ModelPort,
  ) {}

  async chat(request: ModelRequest): Promise<ModelResponse> {
    await this.loader.ensureLoaded(request.modelName);
    return this.inner.chat(request);
  }
}
