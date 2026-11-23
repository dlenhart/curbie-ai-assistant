import type { RecipeSearchDocument } from './interfaces/recipe-search-document.interface';
import type { ParsedRecipe } from './interfaces/parsed-recipe.interface';
import type { RecipeSection } from './interfaces/recipe-section.interface';

export function buildRecipeSearchDocument(recipe: ParsedRecipe): RecipeSearchDocument {
  return {
    title: recipe.title ?? '',
    ingredients: flattenSections(recipe.ingredientSections, (line) => line.originalText),
    steps: flattenSections(recipe.stepSections, (step) => step),
    notes: recipe.notes,
  };
}

function flattenSections<T>(sections: readonly RecipeSection<T>[], toText: (item: T) => string): string {
  return sections
    .flatMap((section) => [...(section.heading === null ? [] : [section.heading]), ...section.items.map(toText)])
    .join('\n');
}
