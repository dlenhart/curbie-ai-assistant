import type { SkillDefinition } from '../skills/interfaces/skill-definition.interface';
import { buildFinalizeInstruction, buildRejectionNotice, buildSystemPrompt } from './system-prompt.builder';

const skill: SkillDefinition = {
  name: 'calculator',
  description: 'Exact arithmetic.',
  kind: 'lookup',
  adapterName: 'calculator',
  tools: [],
  instructions: 'Never compute numbers yourself.',
};

describe('buildSystemPrompt', () => {
  it('states the honesty rules and includes each skill with its instructions', () => {
    const prompt = buildSystemPrompt([skill]);
    expect(prompt).toContain('You are Curbie');
    expect(prompt).toContain('Never answer factual questions from your own memory');
    expect(prompt).toContain('untrusted data');
    expect(prompt).toContain('## Skill: calculator');
    expect(prompt).toContain('Never compute numbers yourself.');
  });

  it('works with no skills', () => {
    expect(buildSystemPrompt([])).not.toContain('## Skill:');
  });
});

describe('buildFinalizeInstruction', () => {
  it('lists the source IDs available this turn', () => {
    expect(buildFinalizeInstruction(['src_1', 'src_2'])).toContain('Source IDs available this turn: src_1, src_2');
  });

  it('says so when nothing was retrieved', () => {
    expect(buildFinalizeInstruction([])).toContain('Source IDs available this turn: none');
  });
});

describe('buildRejectionNotice', () => {
  it('includes the reason and the dont_know escape hatch', () => {
    const notice = buildRejectionNotice('Quote not found verbatim in source "src_2".');
    expect(notice).toContain('Quote not found verbatim');
    expect(notice).toContain('"dont_know"');
  });
});
