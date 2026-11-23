import type { RecipeStatus } from '../types/recipe-status.type';

export interface RecipeSummary {
  readonly id: string;
  readonly title: string;
  readonly status: RecipeStatus;
  readonly hasPendingEdit: boolean;
}
