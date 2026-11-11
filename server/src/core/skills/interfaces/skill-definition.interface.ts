import type { ToolDefinition } from '../../model/interfaces/tool-definition.interface';
import type { SkillKind } from '../types/skill-kind.type';

export interface SkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly kind: SkillKind;
  readonly adapterName: string;
  readonly tools: readonly ToolDefinition[];
  readonly instructions: string;
}
