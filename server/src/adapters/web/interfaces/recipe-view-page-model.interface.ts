import type { NavigationLink } from './navigation-link.interface';
import type { RecipePageImage } from './recipe-page-image.interface';

export interface RecipeViewPageModel {
  readonly pageTitle: string;
  readonly navigation: readonly NavigationLink[];
  readonly title: string;
  readonly approvedMarkdown: string;
  readonly pageImages: readonly RecipePageImage[];
}
