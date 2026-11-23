import type { SkillAdapter } from '../../core/skills/interfaces/skill-adapter.interface';
import { CalculatorAdapter } from './calculator.adapter';
import { ClockAdapter } from './clock.adapter';
import type { SkillAdapterDependencies } from './interfaces/skill-adapter-dependencies.interface';
import { RecipesAdapter } from './recipes.adapter';

export function createSkillAdapters(dependencies: SkillAdapterDependencies): SkillAdapter[] {
  return [
    new CalculatorAdapter(),
    new ClockAdapter(dependencies.clock),
    new RecipesAdapter(dependencies.recipeRepository),
  ];
}
