import type { ToolCallRequest } from './tool-call-request.interface';

export interface ModelResponse {
  readonly content: string;
  readonly toolCalls: readonly ToolCallRequest[];
}
