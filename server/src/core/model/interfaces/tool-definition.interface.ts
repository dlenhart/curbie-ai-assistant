import type { JsonSchema } from '../types/json-schema.type';

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
}
