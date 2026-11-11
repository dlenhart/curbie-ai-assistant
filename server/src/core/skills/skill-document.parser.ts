import matter from 'gray-matter';
import { SKILL_KINDS, SKILL_NAME_PATTERN, TOOL_NAME_PATTERN } from '../../constants';
import type { ToolDefinition } from '../model/interfaces/tool-definition.interface';
import type { JsonSchema } from '../model/types/json-schema.type';
import { InvalidSkillDocumentError } from './errors/invalid-skill-document.error';
import type { SkillDefinition } from './interfaces/skill-definition.interface';
import type { SkillKind } from './types/skill-kind.type';

export function parseSkillDocument(sourceName: string, text: string): SkillDefinition {
  const document = matter(text);
  const frontmatter = document.data as Record<string, unknown>;

  const name = requireString(frontmatter, 'name', sourceName);
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new InvalidSkillDocumentError(`${sourceName}: skill name "${name}" must be lowercase letters, digits, and dashes.`);
  }
  const description = requireString(frontmatter, 'description', sourceName);
  const kind = requireKind(frontmatter.kind, sourceName);
  const adapterName = requireString(frontmatter, 'adapter', sourceName);

  if (!Array.isArray(frontmatter.tools) || frontmatter.tools.length === 0) {
    throw new InvalidSkillDocumentError(`${sourceName}: a skill must declare at least one tool.`);
  }
  const tools = frontmatter.tools.map((tool, index) => parseTool(tool, index, sourceName));

  return { name, description, kind, adapterName, tools, instructions: document.content.trim() };
}

function requireString(fields: Record<string, unknown>, field: string, sourceName: string): string {
  const value = fields[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidSkillDocumentError(`${sourceName}: missing or empty "${field}".`);
  }
  return value.trim();
}

function requireKind(value: unknown, sourceName: string): SkillKind {
  if (typeof value === 'string' && (SKILL_KINDS as readonly string[]).includes(value)) {
    return value as SkillKind;
  }
  throw new InvalidSkillDocumentError(`${sourceName}: "kind" must be one of ${SKILL_KINDS.join(', ')}.`);
}

function parseTool(raw: unknown, index: number, sourceName: string): ToolDefinition {
  const location = `${sourceName} tool #${index + 1}`;
  if (typeof raw !== 'object' || raw === null) {
    throw new InvalidSkillDocumentError(`${location}: must be a mapping.`);
  }
  const fields = raw as Record<string, unknown>;
  const name = requireString(fields, 'name', location);
  if (!TOOL_NAME_PATTERN.test(name)) {
    throw new InvalidSkillDocumentError(`${location}: tool name "${name}" must be snake_case.`);
  }
  const description = requireString(fields, 'description', location);
  const parameters = fields.parameters;
  if (typeof parameters !== 'object' || parameters === null || (parameters as JsonSchema).type !== 'object') {
    throw new InvalidSkillDocumentError(`${location}: "parameters" must be a JSON schema with type: object.`);
  }
  return { name, description, parameters: parameters as JsonSchema };
}
