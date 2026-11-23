import type { NavigationLink } from './navigation-link.interface';

export interface ManagePageModel {
  readonly pageTitle: string;
  readonly navigation: readonly NavigationLink[];
  readonly approvedRecipeCount: number;
  readonly needsReviewRecipeCount: number;
}
