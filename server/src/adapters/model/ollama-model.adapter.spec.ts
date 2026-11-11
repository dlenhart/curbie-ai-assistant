import { ModelUnavailableError } from '../../core/model/errors/model-unavailable.error';
import type { CapturedRequest } from './interfaces/captured-request.interface';
import { OllamaModelAdapter, parseOllamaChatResponse } from './ollama-model.adapter';
import type { FetchFunction } from './types/fetch-function.type';

function fakeFetch(responseBody: unknown, status = 200): { fetchFunction: FetchFunction; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const fetchFunction: FetchFunction = async (url, init) => {
    captured.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)),
    };
  };
  return { fetchFunction, captured };
}

const CALCULATOR_TOOL = {
  name: 'evaluate_expression',
  description: 'Evaluate math.',
  parameters: { type: 'object', properties: { expression: { type: 'string' } } },
};

describe('OllamaModelAdapter', () => {
  it('sends messages and tools in Ollama format and keeps the model loaded', async () => {
    const { fetchFunction, captured } = fakeFetch({ message: { role: 'assistant', content: 'hello' } });
    const adapter = new OllamaModelAdapter({ baseUrl: 'http://127.0.0.1:11434', modelName: 'qwen3:4b', fetchFunction });

    const response = await adapter.chat({
      messages: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', toolCalls: [{ name: 'evaluate_expression', arguments: { expression: '1+1' } }] },
        { role: 'tool', toolName: 'evaluate_expression', content: '1+1 = 2' },
      ],
      tools: [CALCULATOR_TOOL],
    });

    expect(response).toEqual({ content: 'hello', toolCalls: [] });
    expect(captured[0].url).toBe('http://127.0.0.1:11434/api/chat');
    expect(captured[0].body).toEqual({
      model: 'qwen3:4b',
      stream: false,
      keep_alive: -1,
      messages: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'evaluate_expression', arguments: { expression: '1+1' } } }],
        },
        { role: 'tool', tool_name: 'evaluate_expression', content: '1+1 = 2' },
      ],
      tools: [{ type: 'function', function: CALCULATOR_TOOL }],
    });
  });

  it('sends a JSON schema as format and omits tools when a structured answer is requested', async () => {
    const { fetchFunction, captured } = fakeFetch({ message: { content: '{}' } });
    const adapter = new OllamaModelAdapter({ baseUrl: 'http://x', modelName: 'm', fetchFunction });
    const schema = { type: 'object' };

    await adapter.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [], responseSchema: schema });

    expect(captured[0].body.format).toEqual(schema);
    expect(captured[0].body).not.toHaveProperty('tools');
  });

  it('refuses to combine tools with a response schema', async () => {
    const { fetchFunction } = fakeFetch({ message: { content: '' } });
    const adapter = new OllamaModelAdapter({ baseUrl: 'http://x', modelName: 'm', fetchFunction });
    await expect(
      adapter.chat({ messages: [], tools: [CALCULATOR_TOOL], responseSchema: { type: 'object' } }),
    ).rejects.toThrow(/cannot be combined/);
  });

  it('turns HTTP errors into ModelUnavailableError with the status', async () => {
    const { fetchFunction } = fakeFetch('model "qwen3:4b" not found', 404);
    const adapter = new OllamaModelAdapter({ baseUrl: 'http://x', modelName: 'qwen3:4b', fetchFunction });
    await expect(adapter.chat({ messages: [], tools: [] })).rejects.toThrow(ModelUnavailableError);
    await expect(adapter.chat({ messages: [], tools: [] })).rejects.toThrow(/HTTP 404.*not found/);
  });

  it('turns network failures into ModelUnavailableError naming the URL', async () => {
    const fetchFunction: FetchFunction = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
    };
    const adapter = new OllamaModelAdapter({ baseUrl: 'http://127.0.0.1:11434', modelName: 'm', fetchFunction });
    await expect(adapter.chat({ messages: [], tools: [] })).rejects.toThrow(
      'Could not reach Ollama at http://127.0.0.1:11434: connect ECONNREFUSED 127.0.0.1:11434',
    );
  });
});

describe('parseOllamaChatResponse', () => {
  it('parses tool calls with object arguments', () => {
    const text = JSON.stringify({
      message: { content: '', tool_calls: [{ function: { name: 'evaluate_expression', arguments: { expression: '2*3' } } }] },
    });
    expect(parseOllamaChatResponse(text)).toEqual({
      content: '',
      toolCalls: [{ name: 'evaluate_expression', arguments: { expression: '2*3' } }],
    });
  });

  it('parses tool-call arguments delivered as a JSON string', () => {
    const text = JSON.stringify({
      message: { content: '', tool_calls: [{ function: { name: 'evaluate_expression', arguments: '{"expression":"2*3"}' } }] },
    });
    expect(parseOllamaChatResponse(text).toolCalls).toEqual([{ name: 'evaluate_expression', arguments: { expression: '2*3' } }]);
  });

  it('treats unparseable arguments as empty so schema validation rejects them downstream', () => {
    const text = JSON.stringify({ message: { content: '', tool_calls: [{ function: { name: 't', arguments: '{oops' } }] } });
    expect(parseOllamaChatResponse(text).toolCalls).toEqual([{ name: 't', arguments: {} }]);
  });

  it('rejects responses that are not JSON or have no message', () => {
    expect(() => parseOllamaChatResponse('<html>')).toThrow(ModelUnavailableError);
    expect(() => parseOllamaChatResponse('{}')).toThrow(/no message/);
  });

  it('rejects a tool call without a name', () => {
    const text = JSON.stringify({ message: { content: '', tool_calls: [{ function: { arguments: {} } }] } });
    expect(() => parseOllamaChatResponse(text)).toThrow(/malformed tool call/);
  });
});
