import Ajv, { type ValidateFunction } from 'ajv';
import type { ToolCallRequest } from '../model/interfaces/tool-call-request.interface';
import type { ToolDefinition } from '../model/interfaces/tool-definition.interface';
import type { IdGenerator } from '../shared/interfaces/id-generator.interface';
import { SkillRegistrationError } from './errors/skill-registration.error';
import type { RegisteredTool } from './interfaces/registered-tool.interface';
import type { SkillAdapter } from './interfaces/skill-adapter.interface';
import type { SkillDefinition } from './interfaces/skill-definition.interface';
import type { ToolExecutionOutcome } from './types/tool-execution-outcome.type';

export class ToolRegistry {
  private readonly toolsByName = new Map<string, RegisteredTool>();
  private readonly skills: SkillDefinition[] = [];
  private readonly schemaValidator = new Ajv({ allErrors: true, strict: true });

  constructor(private readonly idGenerator: IdGenerator) {}

  register(skill: SkillDefinition, adapter: SkillAdapter): void {
    if (adapter.name !== skill.adapterName) {
      throw new SkillRegistrationError(
        `Skill "${skill.name}" expects adapter "${skill.adapterName}" but was given "${adapter.name}".`,
      );
    }
    if (this.skills.some((existing) => existing.name === skill.name)) {
      throw new SkillRegistrationError(`Skill "${skill.name}" is registered more than once.`);
    }
    for (const tool of skill.tools) {
      if (this.toolsByName.has(tool.name)) {
        throw new SkillRegistrationError(`Tool "${tool.name}" is declared by more than one skill.`);
      }
      this.toolsByName.set(tool.name, {
        skillName: skill.name,
        definition: tool,
        adapter,
        validateArguments: this.compileSchema(skill.name, tool),
      });
    }
    this.skills.push(skill);
  }

  registeredSkills(): readonly SkillDefinition[] {
    return [...this.skills];
  }

  toolDefinitions(): readonly ToolDefinition[] {
    return [...this.toolsByName.values()].map((tool) => tool.definition);
  }

  async execute(call: ToolCallRequest): Promise<ToolExecutionOutcome> {
    const tool = this.toolsByName.get(call.name);
    if (tool === undefined) {
      return { kind: 'rejected', reason: `Unknown tool "${call.name}". Only registered tools can be called.` };
    }
    if (!tool.validateArguments(call.arguments)) {
      return {
        kind: 'rejected',
        reason: `Invalid arguments for "${call.name}": ${this.schemaValidator.errorsText(tool.validateArguments.errors)}`,
      };
    }
    try {
      const result = await tool.adapter.execute(call.name, call.arguments);
      return {
        kind: 'success',
        source: {
          id: this.idGenerator.next('src'),
          skillName: tool.skillName,
          title: result.title,
          content: result.content,
          requiresQuote: result.requiresQuote,
        },
      };
    } catch (error) {
      return { kind: 'failed', reason: `${call.name} failed: ${(error as Error).message}` };
    }
  }

  private compileSchema(skillName: string, tool: ToolDefinition): ValidateFunction {
    try {
      return this.schemaValidator.compile(tool.parameters);
    } catch (error) {
      throw new SkillRegistrationError(
        `Tool "${tool.name}" in skill "${skillName}" has an invalid parameter schema: ${(error as Error).message}`,
      );
    }
  }
}
