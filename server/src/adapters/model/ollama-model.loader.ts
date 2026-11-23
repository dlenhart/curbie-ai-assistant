import {
  OLLAMA_CATALOG_TIMEOUT_MILLISECONDS,
  OLLAMA_CONTEXT_WINDOW_TOKENS,
  OLLAMA_MODEL_LOAD_TIMEOUT_MILLISECONDS,
} from '../../constants';
import { ModelUnavailableError } from '../../core/model/errors/model-unavailable.error';
import type { ModelLoaderPort } from '../../core/model/interfaces/model-loader-port.interface';
import type { OllamaModelLoaderOptions } from './interfaces/ollama-model-loader-options.interface';

export class OllamaModelLoader implements ModelLoaderPort {
  private readonly pendingLoads = new Map<string, Promise<void>>();

  constructor(private readonly options: OllamaModelLoaderOptions) {}

  ensureLoaded(modelName: string): Promise<void> {
    const pending = this.pendingLoads.get(modelName);
    if (pending !== undefined) return pending;

    const load = this.loadIfNotRunning(modelName).finally(() => this.pendingLoads.delete(modelName));
    this.pendingLoads.set(modelName, load);
    return load;
  }

  private async loadIfNotRunning(modelName: string): Promise<void> {
    const runningModelNames = await this.listRunningModelNames();
    if (runningModelNames.includes(modelName)) return;
    await this.load(modelName);
  }

  private async listRunningModelNames(): Promise<readonly string[]> {
    let response: Awaited<ReturnType<OllamaModelLoaderOptions['getFunction']>>;
    try {
      response = await this.options.getFunction(`${this.options.baseUrl}/api/ps`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.options.statusTimeoutMilliseconds ?? OLLAMA_CATALOG_TIMEOUT_MILLISECONDS),
      });
    } catch (error) {
      throw new ModelUnavailableError(`Could not reach Ollama at ${this.options.baseUrl}: ${(error as Error).message}`);
    }

    const responseText = await response.text();
    if (!response.ok) {
      throw new ModelUnavailableError(`Ollama returned HTTP ${response.status}: ${responseText.slice(0, 500)}`);
    }
    return parseRunningModelNames(responseText);
  }

  private async load(modelName: string): Promise<void> {
    let response: Awaited<ReturnType<OllamaModelLoaderOptions['postFunction']>>;
    try {
      response = await this.options.postFunction(`${this.options.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelName, keep_alive: -1, options: { num_ctx: OLLAMA_CONTEXT_WINDOW_TOKENS } }),
        signal: AbortSignal.timeout(this.options.loadTimeoutMilliseconds ?? OLLAMA_MODEL_LOAD_TIMEOUT_MILLISECONDS),
      });
    } catch (error) {
      throw new ModelUnavailableError(`Could not load ${modelName}: ${(error as Error).message}`);
    }

    const responseText = await response.text();
    if (!response.ok) {
      throw new ModelUnavailableError(
        `Could not load ${modelName}: Ollama returned HTTP ${response.status}: ${responseText.slice(0, 500)}`,
      );
    }
  }
}

function parseRunningModelNames(responseText: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new ModelUnavailableError('Ollama returned an unexpected list of running models.');
  }
  const models = (parsed as { models?: unknown }).models;
  if (!Array.isArray(models)) throw new ModelUnavailableError('Ollama returned an unexpected list of running models.');
  return models
    .map((model) => (model as { name?: unknown }).name)
    .filter((name): name is string => typeof name === 'string');
}
