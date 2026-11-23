import type { NewRecipe } from './new-recipe.interface';
import type { RecipeSearchDocument } from './recipe-search-document.interface';
import type { RecipeSearchHit } from './recipe-search-hit.interface';
import type { RecipeStatusCounts } from './recipe-status-counts.interface';
import type { RecipeSummary } from './recipe-summary.interface';
import type { ScanReport } from './scan-report.interface';
import type { StoredRecipe } from './stored-recipe.interface';

export interface RecipeRepository {
  create(recipe: NewRecipe): void;
  findById(id: string): StoredRecipe | undefined;
  listSummaries(): readonly RecipeSummary[];
  saveDraft(id: string, draftMarkdown: string, title: string, updatedAt: string): void;
  approve(id: string, markdown: string, title: string, searchDocument: RecipeSearchDocument, approvedAt: string): void;
  resetDraftToApproved(id: string, approvedTitle: string, updatedAt: string): void;
  remove(id: string): void;
  search(query: string): readonly RecipeSearchHit[];
  hasPhotoHash(sha256: string): boolean;
  countByStatus(): RecipeStatusCounts;
  saveScanReport(report: ScanReport): void;
  latestScanReport(): ScanReport | null;
}
