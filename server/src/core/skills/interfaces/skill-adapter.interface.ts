import type { ToolExecutionContext } from './tool-execution-context.interface';
import type { ToolResult } from './tool-result.interface';

export interface SkillAdapter {
  readonly name: string;
  execute(toolName: string, toolArguments: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult>;
}
