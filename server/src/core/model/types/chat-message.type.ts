import type { ToolCallRequest } from '../interfaces/tool-call-request.interface';

export type ChatMessage =
  | { readonly role: 'system' | 'user'; readonly content: string }
  | { readonly role: 'assistant'; readonly content: string; readonly toolCalls: readonly ToolCallRequest[] }
  | { readonly role: 'tool'; readonly toolName: string; readonly content: string };
