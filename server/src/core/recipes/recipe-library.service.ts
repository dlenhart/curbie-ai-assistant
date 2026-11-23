import { RecipeStateError } from './errors/recipe-state.error';
import { UnknownRecipeError } from './errors/unknown-recipe.error';
import type { RecipeLibraryDependencies } from './interfaces/recipe-library-dependencies.interface';
import type { RecipeStatusCounts } from './interfaces/recipe-status-counts.interface';
import type { RecipeSummary } from './interfaces/recipe-summary.interface';
import type { ScanReport } from './interfaces/scan-report.interface';
import type { StoredRecipe } from './interfaces/stored-recipe.interface';
import { parseRecipeMarkdown } from './recipe-markdown.parser';
import { buildRecipeSearchDocument } from './recipe-search-document.builder';
import type { ApprovalOutcome } from './types/approval-outcome.type';

export class RecipeLibraryService {
  constructor(private readonly dependencies: RecipeLibraryDependencies) {}

  find(id: string): StoredRecipe | undefined {
    return this.dependencies.repository.findById(id);
  }

  saveDraft(id: string, submittedMarkdown: string): void {
    const stored = this.require(id);
    const markdown = normalizeLineEndings(submittedMarkdown);
    const parsed = parseRecipeMarkdown(markdown).recipe;
    this.dependencies.repository.saveDraft(id, markdown, parsed.title ?? stored.title, this.nowIso());
  }

  approve(id: string, submittedMarkdown: string): ApprovalOutcome {
    const markdown = normalizeLineEndings(submittedMarkdown);
    this.saveDraft(id, markdown);
    const stored = this.require(id);
    const result = parseRecipeMarkdown(markdown);
    if (result.problems.length > 0) return { isApproved: false, problems: result.problems };
    this.dependencies.repository.approve(
      id,
      markdown,
      result.recipe.title ?? stored.title,
      buildRecipeSearchDocument(result.recipe),
      this.nowIso(),
    );
    return { isApproved: true };
  }

  discardEdit(id: string): void {
    const stored = this.require(id);
    if (stored.approvedAt === null || stored.approvedMarkdown === null) {
      throw new RecipeStateError(`Recipe ${id} was never approved; there is no approved copy to return to.`);
    }
    const approvedTitle = parseRecipeMarkdown(stored.approvedMarkdown).recipe.title ?? stored.title;
    this.dependencies.repository.resetDraftToApproved(id, approvedTitle, this.nowIso());
  }

  discard(id: string): void {
    const stored = this.require(id);
    if (stored.approvedAt !== null) {
      throw new RecipeStateError(`Recipe ${id} is approved; delete it instead of discarding it.`);
    }
    this.removeWithPhotos(stored);
  }

  delete(id: string): void {
    const stored = this.require(id);
    if (stored.approvedAt === null) {
      throw new RecipeStateError(`Recipe ${id} was never approved; discard it instead of deleting it.`);
    }
    this.removeWithPhotos(stored);
  }

  summaries(): readonly RecipeSummary[] {
    return this.dependencies.repository.listSummaries();
  }

  counts(): RecipeStatusCounts {
    return this.dependencies.repository.countByStatus();
  }

  latestScanReport(): ScanReport | null {
    return this.dependencies.repository.latestScanReport();
  }

  private removeWithPhotos(stored: StoredRecipe): void {
    this.dependencies.files.moveRecipeToDiscarded(stored.id, stored.pages);
    this.dependencies.repository.remove(stored.id);
  }

  private require(id: string): StoredRecipe {
    const stored = this.dependencies.repository.findById(id);
    if (stored === undefined) throw new UnknownRecipeError(id);
    return stored;
  }

  private nowIso(): string {
    return this.dependencies.clock.now().toISOString();
  }
}

function normalizeLineEndings(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n');
}
