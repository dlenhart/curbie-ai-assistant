import { OLLAMA_CATALOG_TIMEOUT_MILLISECONDS } from '../../constants';
import { ModelUnavailableError } from '../../core/model/errors/model-unavailable.error';
import type { ModelCatalogPort } from '../../core/model/interfaces/model-catalog-port.interface';
import type { OllamaModelCatalogAdapterOptions } from './interfaces/ollama-model-catalog-adapter-options.interface';
import type { GetFunction } from './types/get-function.type';

export class OllamaModelCatalogAdapter implements ModelCatalogPort {
  constructor(private readonly options: OllamaModelCatalogAdapterOptions) {}

  async listInstalledModelNames(): Promise<readonly string[]> {
    let response: Awaited<ReturnType<GetFunction>>;
    try {
      response = await this.options.fetchFunction(`${this.options.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.options.timeoutMilliseconds ?? OLLAMA_CATALOG_TIMEOUT_MILLISECONDS),
      });
    } catch (error) {
      throw new ModelUnavailableError(`Could not reach Ollama at ${this.options.baseUrl}: ${(error as Error).message}`);
    }

    const responseText = await response.text();
    if (!response.ok) {
      throw new ModelUnavailableError(`Ollama returned HTTP ${response.status}: ${responseText.slice(0, 500)}`);
    }
    return parseModelNames(responseText);
  }
}

function parseModelNames(responseText: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new ModelUnavailableError('Ollama returned an unexpected model list.');
  }
  const models = (parsed as { models?: unknown }).models;
  if (!Array.isArray(models)) throw new ModelUnavailableError('Ollama returned an unexpected model list.');
  return models
    .map((model) => (model as { name?: unknown }).name)
    .filter((name): name is string => typeof name === 'string');
}
