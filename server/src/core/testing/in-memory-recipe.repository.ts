import { RECIPE_SEARCH_RESULT_LIMIT } from '../../constants';
import { UnknownRecipeError } from '../recipes/errors/unknown-recipe.error';
import type { NewRecipe } from '../recipes/interfaces/new-recipe.interface';
import type { RecipeRepository } from '../recipes/interfaces/recipe-repository.interface';
import type { RecipeSearchDocument } from '../recipes/interfaces/recipe-search-document.interface';
import type { RecipeSearchHit } from '../recipes/interfaces/recipe-search-hit.interface';
import type { RecipeStatusCounts } from '../recipes/interfaces/recipe-status-counts.interface';
import type { RecipeSummary } from '../recipes/interfaces/recipe-summary.interface';
import type { ScanReport } from '../recipes/interfaces/scan-report.interface';
import type { StoredRecipe } from '../recipes/interfaces/stored-recipe.interface';
import { formatIngredientPreview } from '../recipes/recipe-ingredient-preview.formatter';
import { extractRecipeSearchWords } from '../recipes/recipe-search-words.extractor';

export class InMemoryRecipeRepository implements RecipeRepository {
  private readonly recipesById = new Map<string, StoredRecipe>();
  private readonly searchDocumentsById = new Map<string, RecipeSearchDocument>();
  private scanReport: ScanReport | null = null;

  create(recipe: NewRecipe): void {
    if (this.recipesById.has(recipe.id)) throw new Error(`Recipe ${recipe.id} already exists.`);
    const duplicatePage = recipe.pages.find((page) => this.hasPhotoHash(page.sha256));
    if (duplicatePage !== undefined) throw new Error(`Photo ${duplicatePage.sha256} is already stored.`);
    this.recipesById.set(recipe.id, {
      id: recipe.id,
      title: recipe.title,
      status: 'needs_review',
      draftMarkdown: recipe.draftMarkdown,
      approvedMarkdown: null,
      ocrLines: recipe.ocrLines,
      pages: recipe.pages,
      createdAt: recipe.createdAt,
      updatedAt: recipe.createdAt,
      approvedAt: null,
    });
  }

  findById(id: string): StoredRecipe | undefined {
    return this.recipesById.get(id);
  }

  listSummaries(): readonly RecipeSummary[] {
    return [...this.recipesById.values()]
      .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.id.localeCompare(b.id))
      .map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        status: recipe.status,
        hasPendingEdit: recipe.status === 'approved' && recipe.draftMarkdown !== recipe.approvedMarkdown,
      }));
  }

  saveDraft(id: string, draftMarkdown: string, title: string, updatedAt: string): void {
    const recipe = this.requireRecipe(id);
    const storedTitle = recipe.approvedMarkdown === null ? title : recipe.title;
    this.recipesById.set(id, { ...recipe, draftMarkdown, title: storedTitle, updatedAt });
  }

  approve(id: string, markdown: string, title: string, searchDocument: RecipeSearchDocument, approvedAt: string): void {
    const recipe = this.requireRecipe(id);
    this.recipesById.set(id, {
      ...recipe,
      title,
      status: 'approved',
      draftMarkdown: markdown,
      approvedMarkdown: markdown,
      updatedAt: approvedAt,
      approvedAt,
    });
    this.searchDocumentsById.set(id, searchDocument);
  }

  resetDraftToApproved(id: string, approvedTitle: string, updatedAt: string): void {
    const recipe = this.requireRecipe(id);
    if (recipe.approvedMarkdown === null) {
      this.recipesById.set(id, { ...recipe, updatedAt });
      return;
    }
    this.recipesById.set(id, { ...recipe, draftMarkdown: recipe.approvedMarkdown, title: approvedTitle, updatedAt });
  }

  remove(id: string): void {
    this.requireRecipe(id);
    this.recipesById.delete(id);
    this.searchDocumentsById.delete(id);
  }

  search(query: string): readonly RecipeSearchHit[] {
    const words = extractRecipeSearchWords(query).map((word) => word.toLowerCase());
    if (words.length === 0) return [];
    return [...this.searchDocumentsById.entries()]
      .map(([id, document]) => ({ id, document, matchCount: countMatchingWords(words, document) }))
      .filter((candidate) => candidate.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount || a.document.title.localeCompare(b.document.title))
      .slice(0, RECIPE_SEARCH_RESULT_LIMIT)
      .map(({ id, document }) => ({
        id,
        title: document.title,
        ingredientPreview: formatIngredientPreview(document.ingredients),
      }));
  }

  hasPhotoHash(sha256: string): boolean {
    return [...this.recipesById.values()].some((recipe) => recipe.pages.some((page) => page.sha256 === sha256));
  }

  countByStatus(): RecipeStatusCounts {
    const recipes = [...this.recipesById.values()];
    return {
      needsReview: recipes.filter((recipe) => recipe.status === 'needs_review').length,
      approved: recipes.filter((recipe) => recipe.status === 'approved').length,
    };
  }

  saveScanReport(report: ScanReport): void {
    this.scanReport = report;
  }

  latestScanReport(): ScanReport | null {
    return this.scanReport;
  }

  private requireRecipe(id: string): StoredRecipe {
    const recipe = this.recipesById.get(id);
    if (recipe === undefined) throw new UnknownRecipeError(id);
    return recipe;
  }
}

function countMatchingWords(words: readonly string[], document: RecipeSearchDocument): number {
  const haystack = [document.title, document.ingredients, document.steps, document.notes].join('\n').toLowerCase();
  return words.filter((word) => haystack.includes(word)).length;
}
