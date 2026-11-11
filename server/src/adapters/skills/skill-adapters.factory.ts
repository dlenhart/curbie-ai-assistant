import type { SkillAdapter } from '../../core/skills/interfaces/skill-adapter.interface';
import { CalculatorAdapter } from './calculator.adapter';

export function createSkillAdapters(): SkillAdapter[] {
  return [new CalculatorAdapter()];
}
