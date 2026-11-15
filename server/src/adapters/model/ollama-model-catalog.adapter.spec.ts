import { ModelUnavailableError } from '../../core/model/errors/model-unavailable.error';
import { OllamaModelCatalogAdapter } from './ollama-model-catalog.adapter';
import type { GetFunction } from './types/get-function.type';

function catalogReturning(body: string, status = 200): { adapter: OllamaModelCatalogAdapter; requestedUrls: string[] } {
  const requestedUrls: string[] = [];
  const fetchFunction: GetFunction = async (url) => {
    requestedUrls.push(url);
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { adapter: new OllamaModelCatalogAdapter({ baseUrl: 'http://127.0.0.1:11434', fetchFunction }), requestedUrls };
}

describe('OllamaModelCatalogAdapter', () => {
  it('lists the installed model names from /api/tags', async () => {
    const { adapter, requestedUrls } = catalogReturning('{"models":[{"name":"qwen3:4b-instruct"},{"name":"qwen3:8b"}]}');
    await expect(adapter.listInstalledModelNames()).resolves.toEqual(['qwen3:4b-instruct', 'qwen3:8b']);
    expect(requestedUrls).toEqual(['http://127.0.0.1:11434/api/tags']);
  });

  it('reports an unreachable Ollama as ModelUnavailableError', async () => {
    const adapter = new OllamaModelCatalogAdapter({
      baseUrl: 'http://127.0.0.1:11434',
      fetchFunction: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(adapter.listInstalledModelNames()).rejects.toThrow(ModelUnavailableError);
    await expect(adapter.listInstalledModelNames()).rejects.toThrow(/ECONNREFUSED/);
  });

  it('reports a non-OK status as ModelUnavailableError', async () => {
    await expect(catalogReturning('boom', 500).adapter.listInstalledModelNames()).rejects.toThrow(/HTTP 500/);
  });

  it('reports a body without models as ModelUnavailableError', async () => {
    await expect(catalogReturning('{"oops":true}').adapter.listInstalledModelNames()).rejects.toThrow(
      new ModelUnavailableError('Ollama returned an unexpected model list.'),
    );
  });

  it('reports a body that is not JSON as ModelUnavailableError', async () => {
    await expect(catalogReturning('<html>').adapter.listInstalledModelNames()).rejects.toThrow(
      new ModelUnavailableError('Ollama returned an unexpected model list.'),
    );
  });
});
