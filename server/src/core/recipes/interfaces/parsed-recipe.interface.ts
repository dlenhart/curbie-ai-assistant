import type { Quantity } from '../types/quantity.type';
import type { IngredientLine } from './ingredient-line.interface';
import type { RecipeSection } from './recipe-section.interface';

export interface ParsedRecipe {
  readonly title: string | null;
  readonly servings: Quantity | null;
  readonly ingredientSections: readonly RecipeSection<IngredientLine>[];
  readonly stepSections: readonly RecipeSection<string>[];
  readonly notes: string;
}
