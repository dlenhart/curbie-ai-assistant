import { InvalidSkillDocumentError } from './errors/invalid-skill-document.error';
import { parseSkillDocument } from './skill-document.parser';

const VALID_DOCUMENT = `---
name: weather
description: Current conditions and forecasts.
kind: lookup
adapter: weather-api
tools:
  - name: get_forecast
    description: Forecast for a location.
    parameters:
      type: object
      properties:
        location: { type: string }
      required: [location]
---

# Weather

Use get_forecast for weather questions.
`;

function withFrontmatter(frontmatter: string): string {
  return `---\n${frontmatter}\n---\nBody`;
}

describe('parseSkillDocument', () => {
  it('parses frontmatter and body into a skill definition', () => {
    expect(parseSkillDocument('weather.md', VALID_DOCUMENT)).toEqual({
      name: 'weather',
      description: 'Current conditions and forecasts.',
      kind: 'lookup',
      adapterName: 'weather-api',
      tools: [
        {
          name: 'get_forecast',
          description: 'Forecast for a location.',
          parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] },
        },
      ],
      instructions: '# Weather\n\nUse get_forecast for weather questions.',
    });
  });

  it.each([
    ['name', 'description: d\nkind: lookup\nadapter: a\ntools: []'],
    ['description', 'name: n\nkind: lookup\nadapter: a\ntools: []'],
    ['adapter', 'name: n\ndescription: d\nkind: lookup\ntools: []'],
  ])('names the file and the missing field "%s"', (field, frontmatter) => {
    expect(() => parseSkillDocument('broken.md', withFrontmatter(frontmatter))).toThrow(InvalidSkillDocumentError);
    expect(() => parseSkillDocument('broken.md', withFrontmatter(frontmatter))).toThrow(
      new RegExp(`broken\\.md.*"${field}"`),
    );
  });

  it('rejects an unknown skill kind', () => {
    const frontmatter = 'name: n\ndescription: d\nkind: magical\nadapter: a\ntools: []';
    expect(() => parseSkillDocument('broken.md', withFrontmatter(frontmatter))).toThrow(/kind/);
  });

  it('rejects a skill without tools', () => {
    const frontmatter = 'name: n\ndescription: d\nkind: lookup\nadapter: a\ntools: []';
    expect(() => parseSkillDocument('broken.md', withFrontmatter(frontmatter))).toThrow(/at least one tool/);
  });

  it('rejects a skill name that is not lowercase-kebab', () => {
    const frontmatter =
      'name: My Skill\ndescription: d\nkind: lookup\nadapter: a\ntools:\n  - name: t\n    description: d\n    parameters: { type: object }';
    expect(() => parseSkillDocument('broken.md', withFrontmatter(frontmatter))).toThrow(/lowercase/);
  });

  it('rejects a tool whose parameters are not an object schema', () => {
    const frontmatter =
      'name: n\ndescription: d\nkind: lookup\nadapter: a\ntools:\n  - name: t\n    description: d\n    parameters: { type: string }';
    expect(() => parseSkillDocument('broken.md', withFrontmatter(frontmatter))).toThrow(/type: object/);
  });

  it('rejects a tool name that is not snake_case', () => {
    const frontmatter =
      'name: n\ndescription: d\nkind: lookup\nadapter: a\ntools:\n  - name: Get-Thing\n    description: d\n    parameters: { type: object }';
    expect(() => parseSkillDocument('broken.md', withFrontmatter(frontmatter))).toThrow(/snake_case/);
  });
});
