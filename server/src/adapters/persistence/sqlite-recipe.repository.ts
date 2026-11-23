import type Database from 'better-sqlite3';
import { RECIPE_SEARCH_RESULT_LIMIT } from '../../constants';
import { UnknownRecipeError } from '../../core/recipes/errors/unknown-recipe.error';
import type { NewRecipe } from '../../core/recipes/interfaces/new-recipe.interface';
import type { OcrLine } from '../../core/recipes/interfaces/ocr-line.interface';
import type { RecipePage } from '../../core/recipes/interfaces/recipe-page.interface';
import type { RecipeRepository } from '../../core/recipes/interfaces/recipe-repository.interface';
import type { RecipeSearchDocument } from '../../core/recipes/interfaces/recipe-search-document.interface';
import type { RecipeSearchHit } from '../../core/recipes/interfaces/recipe-search-hit.interface';
import type { RecipeStatusCounts } from '../../core/recipes/interfaces/recipe-status-counts.interface';
import type { RecipeSummary } from '../../core/recipes/interfaces/recipe-summary.interface';
import type { ScanProblem } from '../../core/recipes/interfaces/scan-problem.interface';
import type { ScanReport } from '../../core/recipes/interfaces/scan-report.interface';
import type { StoredRecipe } from '../../core/recipes/interfaces/stored-recipe.interface';
import { formatIngredientPreview } from '../../core/recipes/recipe-ingredient-preview.formatter';
import { extractRecipeSearchWords } from '../../core/recipes/recipe-search-words.extractor';
import type { RecipeRow } from './interfaces/recipe-row.interface';

export class SqliteRecipeRepository implements RecipeRepository {
  constructor(private readonly database: Database.Database) {}

  create(recipe: NewRecipe): void {
    const insertRecipe = this.database.prepare(
      `INSERT INTO recipes (id, title, status, draft_markdown, approved_markdown, ocr_lines, created_at, updated_at, approved_at)
       VALUES (?, ?, 'needs_review', ?, NULL, ?, ?, ?, NULL)`,
    );
    const insertPage = this.database.prepare(
      'INSERT INTO recipe_pages (recipe_id, page_number, original_path, display_path, sha256) VALUES (?, ?, ?, ?, ?)',
    );
    this.database.transaction(() => {
      insertRecipe.run(
        recipe.id,
        recipe.title,
        recipe.draftMarkdown,
        JSON.stringify(recipe.ocrLines),
        recipe.createdAt,
        recipe.createdAt,
      );
      for (const page of recipe.pages) {
        insertPage.run(recipe.id, page.pageNumber, page.originalPath, page.displayPath, page.sha256);
      }
    })();
  }

  findById(id: string): StoredRecipe | undefined {
    const row = this.database.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as RecipeRow | undefined;
    if (row === undefined) return undefined;
    const pages = this.database
      .prepare(
        'SELECT page_number, original_path, display_path, sha256 FROM recipe_pages WHERE recipe_id = ? ORDER BY page_number',
      )
      .all(id) as { page_number: number; original_path: string; display_path: string; sha256: string }[];
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      draftMarkdown: row.draft_markdown,
      approvedMarkdown: row.approved_markdown,
      ocrLines: JSON.parse(row.ocr_lines) as OcrLine[],
      pages: pages.map(
        (page): RecipePage => ({
          pageNumber: page.page_number,
          originalPath: page.original_path,
          displayPath: page.display_path,
          sha256: page.sha256,
        }),
      ),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      approvedAt: row.approved_at,
    };
  }

  listSummaries(): readonly RecipeSummary[] {
    const rows = this.database
      .prepare(
        `SELECT id, title, status,
           (status = 'approved' AND draft_markdown IS NOT approved_markdown) AS has_pending_edit
         FROM recipes ORDER BY title COLLATE NOCASE, id`,
      )
      .all() as { id: string; title: string; status: RecipeSummary['status']; has_pending_edit: number }[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      hasPendingEdit: row.has_pending_edit === 1,
    }));
  }

  saveDraft(id: string, draftMarkdown: string, title: string, updatedAt: string): void {
    const result = this.database
      .prepare(
        `UPDATE recipes SET draft_markdown = ?, title = CASE WHEN approved_markdown IS NULL THEN ? ELSE title END, updated_at = ?
         WHERE id = ?`,
      )
      .run(draftMarkdown, title, updatedAt, id);
    if (result.changes === 0) throw new UnknownRecipeError(id);
  }

  approve(id: string, markdown: string, title: string, searchDocument: RecipeSearchDocument, approvedAt: string): void {
    this.database.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE recipes SET title = ?, status = 'approved', draft_markdown = ?, approved_markdown = ?, updated_at = ?, approved_at = ?
           WHERE id = ?`,
        )
        .run(title, markdown, markdown, approvedAt, approvedAt, id);
      if (result.changes === 0) throw new UnknownRecipeError(id);
      this.database.prepare('DELETE FROM recipe_search WHERE recipe_id = ?').run(id);
      this.database
        .prepare('INSERT INTO recipe_search (recipe_id, title, ingredients, steps, notes) VALUES (?, ?, ?, ?, ?)')
        .run(id, searchDocument.title, searchDocument.ingredients, searchDocument.steps, searchDocument.notes);
    })();
  }

  resetDraftToApproved(id: string, approvedTitle: string, updatedAt: string): void {
    const result = this.database
      .prepare(
        `UPDATE recipes SET draft_markdown = COALESCE(approved_markdown, draft_markdown),
           title = CASE WHEN approved_markdown IS NULL THEN title ELSE ? END, updated_at = ?
         WHERE id = ?`,
      )
      .run(approvedTitle, updatedAt, id);
    if (result.changes === 0) throw new UnknownRecipeError(id);
  }

  remove(id: string): void {
    this.database.transaction(() => {
      this.database.prepare('DELETE FROM recipe_search WHERE recipe_id = ?').run(id);
      const result = this.database.prepare('DELETE FROM recipes WHERE id = ?').run(id);
      if (result.changes === 0) throw new UnknownRecipeError(id);
    })();
  }

  search(query: string): readonly RecipeSearchHit[] {
    const words = extractRecipeSearchWords(query);
    if (words.length === 0) return [];
    const matchExpression = words.map((word) => `"${word}"`).join(' OR ');
    const rows = this.database
      .prepare(
        `SELECT recipe_id, title, ingredients FROM recipe_search
         WHERE recipe_search MATCH ? ORDER BY bm25(recipe_search), recipe_id LIMIT ?`,
      )
      .all(matchExpression, RECIPE_SEARCH_RESULT_LIMIT) as { recipe_id: string; title: string; ingredients: string }[];
    return rows.map((row) => ({
      id: row.recipe_id,
      title: row.title,
      ingredientPreview: formatIngredientPreview(row.ingredients),
    }));
  }

  hasPhotoHash(sha256: string): boolean {
    return this.database.prepare('SELECT 1 FROM recipe_pages WHERE sha256 = ?').get(sha256) !== undefined;
  }

  countByStatus(): RecipeStatusCounts {
    const row = this.database
      .prepare(
        `SELECT
           COALESCE(SUM(status = 'needs_review'), 0) AS needs_review,
           COALESCE(SUM(status = 'approved'), 0) AS approved
         FROM recipes`,
      )
      .get() as { needs_review: number; approved: number };
    return { needsReview: row.needs_review, approved: row.approved };
  }

  saveScanReport(report: ScanReport): void {
    this.database
      .prepare(
        `INSERT INTO recipe_scan_reports (id, finished_at, imported_count, problems) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET finished_at = excluded.finished_at,
           imported_count = excluded.imported_count, problems = excluded.problems`,
      )
      .run(report.finishedAt, report.importedCount, JSON.stringify(report.problems));
  }

  latestScanReport(): ScanReport | null {
    const row = this.database
      .prepare('SELECT finished_at, imported_count, problems FROM recipe_scan_reports WHERE id = 1')
      .get() as { finished_at: string; imported_count: number; problems: string } | undefined;
    if (row === undefined) return null;
    return {
      finishedAt: row.finished_at,
      importedCount: row.imported_count,
      problems: JSON.parse(row.problems) as ScanProblem[],
    };
  }
}
