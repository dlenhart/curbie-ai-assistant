import type { ModelPort } from '../model/interfaces/model-port.interface';
import type { ModelRequest } from '../model/interfaces/model-request.interface';
import type { ModelResponse } from '../model/interfaces/model-response.interface';

export class ScriptedModel implements ModelPort {
  readonly receivedRequests: ModelRequest[] = [];
  private readonly remainingResponses: Array<ModelResponse | Error>;

  constructor(responses: ReadonlyArray<ModelResponse | Error>) {
    this.remainingResponses = [...responses];
  }

  async chat(request: ModelRequest): Promise<ModelResponse> {
    this.receivedRequests.push({ ...request, messages: [...request.messages], tools: [...request.tools] });
    const next = this.remainingResponses.shift();
    if (next === undefined) {
      throw new Error(`ScriptedModel ran out of responses on call ${this.receivedRequests.length}.`);
    }
    if (next instanceof Error) throw next;
    return next;
  }
}

export function textResponse(content: string): ModelResponse {
  return { content, toolCalls: [] };
}

export function toolCallResponse(name: string, toolArguments: Record<string, unknown>): ModelResponse {
  return { content: '', toolCalls: [{ name, arguments: toolArguments }] };
}

export function answerResponse(answer: unknown): ModelResponse {
  return { content: JSON.stringify(answer), toolCalls: [] };
}
