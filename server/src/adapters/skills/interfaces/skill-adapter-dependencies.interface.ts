import type { RecipeRepository } from '../../../core/recipes/interfaces/recipe-repository.interface';
import type { Clock } from '../../../core/shared/interfaces/clock.interface';

export interface SkillAdapterDependencies {
  readonly clock: Clock;
  readonly recipeRepository: RecipeRepository;
}
