import type { ChatMessage } from '../types/chat-message.type';
import type { JsonSchema } from '../types/json-schema.type';
import type { ToolDefinition } from './tool-definition.interface';

export interface ModelRequest {
  readonly messages: readonly ChatMessage[];
  readonly tools: readonly ToolDefinition[];
  readonly responseSchema?: JsonSchema;
}
