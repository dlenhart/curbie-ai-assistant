import type { ToolResult } from './tool-result.interface';

export interface SkillAdapter {
  readonly name: string;
  execute(toolName: string, toolArguments: Record<string, unknown>): Promise<ToolResult>;
}
