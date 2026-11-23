import { RecordingModelLoader } from '../testing/recording-model.loader';
import { ScriptedModel, textResponse } from '../testing/scripted.model';
import { ModelUnavailableError } from './errors/model-unavailable.error';
import { ModelLoadingDecorator } from './model-loading.decorator';

const REQUEST = { modelName: 'qwen3:8b', messages: [{ role: 'user' as const, content: 'hi' }], tools: [] };

describe('ModelLoadingDecorator', () => {
  it('loads the requested model before delegating the chat', async () => {
    const loader = new RecordingModelLoader();
    const inner = new ScriptedModel([textResponse('hello')]);
    const model = new ModelLoadingDecorator(loader, inner);

    await expect(model.chat(REQUEST)).resolves.toEqual({ content: 'hello', toolCalls: [] });
    expect(loader.requestedModelNames).toEqual(['qwen3:8b']);
    expect(inner.receivedRequests).toHaveLength(1);
  });

  it('does not call the model when loading fails', async () => {
    const loader = new RecordingModelLoader(new ModelUnavailableError('Could not load qwen3:8b.'));
    const inner = new ScriptedModel([textResponse('hello')]);
    const model = new ModelLoadingDecorator(loader, inner);

    await expect(model.chat(REQUEST)).rejects.toThrow('Could not load qwen3:8b.');
    expect(inner.receivedRequests).toHaveLength(0);
  });
});
