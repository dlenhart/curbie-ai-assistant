import type { NavigationLink } from './navigation-link.interface';

export interface ChatPageModel {
  readonly pageTitle: string;
  readonly navigation: readonly NavigationLink[];
  readonly scriptPath: string;
  readonly conversationId: string;
  readonly recipeNotice: string | null;
}
