import { SequentialIdGenerator } from '../testing/sequential-id.generator';
import { buildToolRegistry } from './tool-registry.factory';
import { SkillRegistrationError } from './errors/skill-registration.error';
import type { SkillAdapter } from './interfaces/skill-adapter.interface';
import type { SkillDefinition } from './interfaces/skill-definition.interface';
import type { ToolResult } from './interfaces/tool-result.interface';

const skill: SkillDefinition = {
  name: 'echo',
  description: 'Repeats text back.',
  kind: 'lookup',
  adapterName: 'echo',
  instructions: '',
  tools: [{ name: 'echo_text', description: 'Repeat.', parameters: { type: 'object', properties: {} } }],
};

const adapter: SkillAdapter = {
  name: 'echo',
  execute: async (): Promise<ToolResult> => ({ title: 'Echo', content: '', requiresQuote: false }),
};

describe('buildToolRegistry', () => {
  it('registers each skill with its adapter', () => {
    const registry = buildToolRegistry([skill], [adapter], new SequentialIdGenerator());
    expect(registry.toolDefinitions().map((tool) => tool.name)).toEqual(['echo_text']);
  });

  it('fails loudly when a skill needs an adapter that does not exist in code', () => {
    expect(() => buildToolRegistry([skill], [], new SequentialIdGenerator())).toThrow(
      'Skill "echo" needs adapter "echo", which does not exist in code.',
    );
  });

  it('refuses two skills with the same name', () => {
    const duplicate: SkillDefinition = {
      ...skill,
      tools: [{ name: 'other_tool', description: 'x', parameters: { type: 'object' } }],
    };
    expect(() => buildToolRegistry([skill, duplicate], [adapter], new SequentialIdGenerator())).toThrow(
      SkillRegistrationError,
    );
  });
});
