import type { RecipeStatus } from '../types/recipe-status.type';
import type { OcrLine } from './ocr-line.interface';
import type { RecipePage } from './recipe-page.interface';

export interface StoredRecipe {
  readonly id: string;
  readonly title: string;
  readonly status: RecipeStatus;
  readonly draftMarkdown: string;
  readonly approvedMarkdown: string | null;
  readonly ocrLines: readonly OcrLine[];
  readonly pages: readonly RecipePage[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly approvedAt: string | null;
}
