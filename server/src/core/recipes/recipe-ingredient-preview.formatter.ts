import { RECIPE_SEARCH_PREVIEW_INGREDIENT_COUNT } from '../../constants';

export function formatIngredientPreview(ingredients: string): string {
  return ingredients
    .split('\n')
    .filter((line) => line.trim() !== '')
    .slice(0, RECIPE_SEARCH_PREVIEW_INGREDIENT_COUNT)
    .join(', ');
}
