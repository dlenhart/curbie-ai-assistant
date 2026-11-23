import type { RecipeSummary } from '../../../core/recipes/interfaces/recipe-summary.interface';
import type { ScanProblem } from '../../../core/recipes/interfaces/scan-problem.interface';
import type { NavigationLink } from './navigation-link.interface';

export interface RecipesPageModel {
  readonly pageTitle: string;
  readonly navigation: readonly NavigationLink[];
  readonly scriptPath: string;
  readonly needsReview: readonly RecipeSummary[];
  readonly approved: readonly RecipeSummary[];
  readonly scanProblems: readonly ScanProblem[];
  readonly isScanRunning: boolean;
  readonly statusMessage: string | null;
}
