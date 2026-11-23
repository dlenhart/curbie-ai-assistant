import { ModelUnavailableError } from '../../core/model/errors/model-unavailable.error';
import type { CapturedRequest } from './interfaces/captured-request.interface';
import { OllamaModelLoader } from './ollama-model.loader';
import type { FetchFunction } from './types/fetch-function.type';
import type { GetFunction } from './types/get-function.type';

const BASE_URL = 'http://127.0.0.1:11434';

function respondWith(body: string, status = 200): { ok: boolean; status: number; text(): Promise<string> } {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

function runningModels(...names: string[]): string {
  return JSON.stringify({ models: names.map((name) => ({ name, model: name })) });
}

function createLoader(options: {
  statusBody?: string;
  getFunction?: GetFunction;
  postFunction?: FetchFunction;
  loadTimeoutMilliseconds?: number;
}): { loader: OllamaModelLoader; loadRequests: CapturedRequest[] } {
  const loadRequests: CapturedRequest[] = [];
  const getFunction: GetFunction = options.getFunction ?? (async () => respondWith(options.statusBody ?? runningModels()));
  const postFunction: FetchFunction =
    options.postFunction ??
    (async (url, init) => {
      loadRequests.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      return respondWith('{"done":true}');
    });
  const loader = new OllamaModelLoader({
    baseUrl: BASE_URL,
    getFunction,
    postFunction,
    loadTimeoutMilliseconds: options.loadTimeoutMilliseconds,
  });
  return { loader, loadRequests };
}

describe('OllamaModelLoader', () => {
  it('does nothing when Ollama already has the model in memory', async () => {
    const requestedUrls: string[] = [];
    const { loader, loadRequests } = createLoader({
      getFunction: async (url) => {
        requestedUrls.push(url);
        return respondWith(runningModels('qwen3:4b-instruct'));
      },
    });

    await loader.ensureLoaded('qwen3:4b-instruct');

    expect(requestedUrls).toEqual([`${BASE_URL}/api/ps`]);
    expect(loadRequests).toEqual([]);
  });

  it('loads a model that is not in memory, with the same context size chat uses so Ollama does not reload it', async () => {
    const { loader, loadRequests } = createLoader({ statusBody: runningModels('qwen3:4b-instruct') });

    await loader.ensureLoaded('qwen3:8b');

    expect(loadRequests).toEqual([
      {
        url: `${BASE_URL}/api/generate`,
        body: { model: 'qwen3:8b', keep_alive: -1, options: { num_ctx: 8192 } },
      },
    ]);
  });

  it('shares one load between callers waiting on the same model', async () => {
    let finishLoad: () => void = () => undefined;
    let loadCount = 0;
    const { loader } = createLoader({
      postFunction: () => {
        loadCount++;
        return new Promise((resolve) => {
          finishLoad = () => resolve(respondWith('{"done":true}'));
        });
      },
    });

    const first = loader.ensureLoaded('qwen3:8b');
    const second = loader.ensureLoaded('qwen3:8b');
    await new Promise((resolve) => setImmediate(resolve));
    finishLoad();

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(loadCount).toBe(1);
  });

  it('tries again on the next call after a failed load', async () => {
    let attempt = 0;
    const { loader } = createLoader({
      postFunction: async () => {
        attempt++;
        return attempt === 1 ? respondWith('out of memory', 500) : respondWith('{"done":true}');
      },
    });

    await expect(loader.ensureLoaded('qwen3:8b')).rejects.toThrow(ModelUnavailableError);
    await expect(loader.ensureLoaded('qwen3:8b')).resolves.toBeUndefined();
    expect(attempt).toBe(2);
  });

  it('reports an unreachable Ollama as ModelUnavailableError', async () => {
    const { loader } = createLoader({
      getFunction: async () => {
        throw new Error('ECONNREFUSED');
      },
    });

    await expect(loader.ensureLoaded('qwen3:8b')).rejects.toThrow(ModelUnavailableError);
    await expect(loader.ensureLoaded('qwen3:8b')).rejects.toThrow(/ECONNREFUSED/);
  });

  it('reports an unexpected running-models list as ModelUnavailableError', async () => {
    const { loader } = createLoader({ statusBody: '<html>' });

    await expect(loader.ensureLoaded('qwen3:8b')).rejects.toThrow(
      new ModelUnavailableError('Ollama returned an unexpected list of running models.'),
    );
  });

  it('names the model when Ollama refuses to load it', async () => {
    const { loader } = createLoader({ postFunction: async () => respondWith('model not found', 404) });

    await expect(loader.ensureLoaded('qwen3:99b')).rejects.toThrow(
      /Could not load qwen3:99b: Ollama returned HTTP 404: model not found/,
    );
  });

  it('gives up on a load that outlasts its timeout', async () => {
    const { loader } = createLoader({
      loadTimeoutMilliseconds: 20,
      postFunction: (_url, init) =>
        new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
    });

    await expect(loader.ensureLoaded('qwen3:8b')).rejects.toThrow(/Could not load qwen3:8b/);
  });
});
