import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidSkillDocumentError } from '../../core/skills/errors/invalid-skill-document.error';
import { loadSkillDocuments } from './skill-directory.loader';

const REPOSITORY_SKILLS_DIRECTORY = join(__dirname, '..', '..', '..', '..', 'skills');

function skillDocument(name: string): string {
  return `---\nname: ${name}\ndescription: d\nkind: lookup\nadapter: a\ntools:\n  - name: ${name.replace(/-/g, '_')}_tool\n    description: d\n    parameters: { type: object }\n---\nBody`;
}

describe('loadSkillDocuments', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'curbie-skills-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('loads every .md file sorted by file name and ignores other files', () => {
    writeFileSync(join(directory, 'b-second.md'), skillDocument('second'));
    writeFileSync(join(directory, 'a-first.md'), skillDocument('first'));
    writeFileSync(join(directory, 'notes.txt'), 'not a skill');
    expect(loadSkillDocuments(directory).map((skill) => skill.name)).toEqual(['first', 'second']);
  });

  it('fails loudly when the directory cannot be read', () => {
    expect(() => loadSkillDocuments(join(directory, 'missing'))).toThrow(InvalidSkillDocumentError);
  });

  it('loads the real calculator skill from the repository', () => {
    const calculator = loadSkillDocuments(REPOSITORY_SKILLS_DIRECTORY).find((skill) => skill.name === 'calculator');
    expect(calculator?.adapterName).toBe('calculator');
    expect(calculator?.tools.map((tool) => tool.name)).toEqual(['evaluate_expression']);
  });
});
