import type { IdGenerator } from '../shared/interfaces/id-generator.interface';
import { SkillRegistrationError } from './errors/skill-registration.error';
import type { SkillAdapter } from './interfaces/skill-adapter.interface';
import type { SkillDefinition } from './interfaces/skill-definition.interface';
import { ToolRegistry } from './tool.registry';

export function buildToolRegistry(
  skills: readonly SkillDefinition[],
  adapters: readonly SkillAdapter[],
  idGenerator: IdGenerator,
): ToolRegistry {
  const adaptersByName = new Map(adapters.map((adapter) => [adapter.name, adapter]));
  const registry = new ToolRegistry(idGenerator);
  for (const skill of skills) {
    const adapter = adaptersByName.get(skill.adapterName);
    if (adapter === undefined) {
      throw new SkillRegistrationError(
        `Skill "${skill.name}" needs adapter "${skill.adapterName}", which does not exist in code.`,
      );
    }
    registry.register(skill, adapter);
  }
  return registry;
}
