import type { RecipeNoticeInput } from './interfaces/recipe-notice-input.interface';

export function buildRecipeNotice(input: RecipeNoticeInput): string | null {
  const parts: string[] = [];
  if (input.needsReviewCount > 0) {
    parts.push(`${input.needsReviewCount} new ${pluralize(input.needsReviewCount, 'recipe', 'recipes')} ready to review`);
  }
  if (input.scanProblemCount > 0) {
    parts.push(`${input.scanProblemCount} ${pluralize(input.scanProblemCount, 'scan problem', 'scan problems')}`);
  }
  if (parts.length === 0) return null;
  return `▲ ${parts.join(' · ')}`;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
