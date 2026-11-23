import type { OcrLine } from './ocr-line.interface';
import type { RecipePage } from './recipe-page.interface';

export interface NewRecipe {
  readonly id: string;
  readonly title: string;
  readonly draftMarkdown: string;
  readonly ocrLines: readonly OcrLine[];
  readonly pages: readonly RecipePage[];
  readonly createdAt: string;
}
