import { HONESTY_RULES } from '../../constants';
import type { SkillDefinition } from '../skills/interfaces/skill-definition.interface';

export function buildSystemPrompt(skills: readonly SkillDefinition[]): string {
  const lines = [...HONESTY_RULES];
  if (skills.length > 0) {
    lines.push('', 'Skills available:');
    for (const skill of skills) {
      lines.push('', `## Skill: ${skill.name}`, skill.description, '', skill.instructions);
    }
  }
  return lines.join('\n');
}

export function buildFinalizeInstruction(availableSourceIds: readonly string[]): string {
  const sourceList = availableSourceIds.length > 0 ? availableSourceIds.join(', ') : 'none';
  return [
    'Now give your final answer as JSON matching the required schema.',
    `Source IDs available this turn: ${sourceList}`,
    'Categories:',
    '- "cited": every factual claim comes from the sources above. List their IDs in sourceIds. For sources that require it, add an exact quote copied verbatim.',
    '- "dont_know": your sources do not contain the answer. Say so plainly.',
    '- "generated": content you created (such as code), not facts.',
    '- "conversational": small talk with no factual claims.',
    'Never state facts from your own memory.',
  ].join('\n');
}

export function buildRejectionNotice(reason: string): string {
  return `Your previous answer was rejected: ${reason} Correct it, or use category "dont_know".`;
}
