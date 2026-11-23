import { NotFoundException } from '@nestjs/common';
import { RECIPE_ID_PATTERN } from '../../constants';
import type { StoredRecipe } from '../../core/recipes/interfaces/stored-recipe.interface';
import type { RecipeLibraryService } from '../../core/recipes/recipe-library.service';

export function resolveStoredRecipe(library: RecipeLibraryService, requestedId: unknown): StoredRecipe {
  if (typeof requestedId !== 'string' || !RECIPE_ID_PATTERN.test(requestedId)) throw new NotFoundException();
  const recipe = library.find(requestedId);
  if (recipe === undefined) throw new NotFoundException();
  return recipe;
}
