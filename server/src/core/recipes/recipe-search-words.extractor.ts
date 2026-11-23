import { RECIPE_SEARCH_WORD_PATTERN } from '../../constants';

export function extractRecipeSearchWords(query: string): string[] {
  return query.match(RECIPE_SEARCH_WORD_PATTERN) ?? [];
}
