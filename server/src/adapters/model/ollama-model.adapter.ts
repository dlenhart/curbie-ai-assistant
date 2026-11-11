import { OLLAMA_DEFAULT_TIMEOUT_MILLISECONDS } from '../../constants';
import { ModelUnavailableError } from '../../core/model/errors/model-unavailable.error';
import type { ModelPort } from '../../core/model/interfaces/model-port.interface';
import type { ModelRequest } from '../../core/model/interfaces/model-request.interface';
import type { ModelResponse } from '../../core/model/interfaces/model-response.interface';
import type { ToolCallRequest } from '../../core/model/interfaces/tool-call-request.interface';
import type { ToolDefinition } from '../../core/model/interfaces/tool-definition.interface';
import type { ChatMessage } from '../../core/model/types/chat-message.type';
import type { OllamaModelAdapterOptions } from './interfaces/ollama-model-adapter-options.interface';
import type { FetchFunction } from './types/fetch-function.type';

export class OllamaModelAdapter implements ModelPort {
  constructor(private readonly options: OllamaModelAdapterOptions) {}

  async chat(request: ModelRequest): Promise<ModelResponse> {
    if (request.responseSchema !== undefined && request.tools.length > 0) {
      throw new Error(
        'responseSchema and tools cannot be combined: Ollama constrains output to JSON, which prevents tool calls.',
      );
    }

    const body = {
      model: this.options.modelName,
      stream: false,
      keep_alive: -1,
      messages: request.messages.map(toOllamaMessage),
      ...(request.tools.length > 0 ? { tools: request.tools.map(toOllamaTool) } : {}),
      ...(request.responseSchema !== undefined ? { format: request.responseSchema } : {}),
    };

    let response: Awaited<ReturnType<FetchFunction>>;
    try {
      response = await this.options.fetchFunction(`${this.options.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMilliseconds ?? OLLAMA_DEFAULT_TIMEOUT_MILLISECONDS),
      });
    } catch (error) {
      throw new ModelUnavailableError(`Could not reach Ollama at ${this.options.baseUrl}: ${(error as Error).message}`);
    }

    const responseText = await response.text();
    if (!response.ok) {
      throw new ModelUnavailableError(`Ollama returned HTTP ${response.status}: ${responseText.slice(0, 500)}`);
    }
    return parseOllamaChatResponse(responseText);
  }
}

export function parseOllamaChatResponse(responseText: string): ModelResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new ModelUnavailableError('Ollama returned a response that is not JSON.');
  }
  const message = (parsed as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) {
    throw new ModelUnavailableError('Ollama response has no message.');
  }
  const { content, tool_calls: rawToolCalls } = message as { content?: unknown; tool_calls?: unknown };
  return {
    content: typeof content === 'string' ? content : '',
    toolCalls: Array.isArray(rawToolCalls) ? rawToolCalls.map(parseToolCall) : [],
  };
}

function parseToolCall(raw: unknown): ToolCallRequest {
  const toolFunction = (raw as { function?: { name?: unknown; arguments?: unknown } }).function;
  if (toolFunction === undefined || typeof toolFunction.name !== 'string') {
    throw new ModelUnavailableError('Ollama returned a malformed tool call (no function name).');
  }
  return { name: toolFunction.name, arguments: parseToolArguments(toolFunction.arguments) };
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toOllamaMessage(message: ChatMessage): Record<string, unknown> {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls.length > 0
          ? { tool_calls: message.toolCalls.map((call) => ({ function: { name: call.name, arguments: call.arguments } })) }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_name: message.toolName, content: message.content };
  }
}

function toOllamaTool(tool: ToolDefinition): Record<string, unknown> {
  return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } };
}
