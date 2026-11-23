import type { NavigationLink } from './navigation-link.interface';
import type { RecipeOcrLineView } from './recipe-ocr-line-view.interface';
import type { RecipePageImage } from './recipe-page-image.interface';

export interface RecipeReviewPageModel {
  readonly pageTitle: string;
  readonly navigation: readonly NavigationLink[];
  readonly scriptPath: string;
  readonly recipeId: string;
  readonly title: string;
  readonly isApproved: boolean;
  readonly hasPendingEdit: boolean;
  readonly draftMarkdown: string;
  readonly problems: readonly string[];
  readonly warnings: readonly string[];
  readonly ocrLines: readonly RecipeOcrLineView[];
  readonly pageImages: readonly RecipePageImage[];
  readonly statusMessage: string | null;
}
