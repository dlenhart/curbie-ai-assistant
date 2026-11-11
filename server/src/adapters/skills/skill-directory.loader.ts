import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InvalidSkillDocumentError } from '../../core/skills/errors/invalid-skill-document.error';
import type { SkillDefinition } from '../../core/skills/interfaces/skill-definition.interface';
import { parseSkillDocument } from '../../core/skills/skill-document.parser';

export function loadSkillDocuments(skillsDirectory: string): SkillDefinition[] {
  let entries: string[];
  try {
    entries = readdirSync(skillsDirectory);
  } catch (error) {
    throw new InvalidSkillDocumentError(`Skills directory ${skillsDirectory} cannot be read: ${(error as Error).message}`);
  }
  return entries
    .filter((entry) => entry.endsWith('.md'))
    .sort()
    .map((entry) => parseSkillDocument(entry, readFileSync(join(skillsDirectory, entry), 'utf8')));
}
