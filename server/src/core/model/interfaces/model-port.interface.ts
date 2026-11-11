import type { ModelRequest } from './model-request.interface';
import type { ModelResponse } from './model-response.interface';

export interface ModelPort {
  chat(request: ModelRequest): Promise<ModelResponse>;
}
