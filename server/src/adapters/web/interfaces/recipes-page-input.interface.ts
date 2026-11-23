import type { RecipeSummary } from '../../../core/recipes/interfaces/recipe-summary.interface';
import type { ScanReport } from '../../../core/recipes/interfaces/scan-report.interface';

export interface RecipesPageInput {
  readonly summaries: readonly RecipeSummary[];
  readonly scanReport: ScanReport | null;
  readonly isScanRunning: boolean;
  readonly statusFlag: unknown;
}
