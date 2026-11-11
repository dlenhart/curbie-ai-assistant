import type { ValidateFunction } from 'ajv';
import type { ToolDefinition } from '../../model/interfaces/tool-definition.interface';
import type { SkillAdapter } from './skill-adapter.interface';

export interface RegisteredTool {
  readonly skillName: string;
  readonly definition: ToolDefinition;
  readonly adapter: SkillAdapter;
  readonly validateArguments: ValidateFunction;
}
