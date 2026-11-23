import type { ParsedRecipe } from './parsed-recipe.interface';
import type { RecipeIssue } from './recipe-issue.interface';

export interface RecipeParseResult {
  readonly recipe: ParsedRecipe;
  readonly problems: readonly RecipeIssue[];
  readonly warnings: readonly RecipeIssue[];
}
