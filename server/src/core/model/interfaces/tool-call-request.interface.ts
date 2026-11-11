export interface ToolCallRequest {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}
