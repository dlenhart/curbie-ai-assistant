import { UnknownRecipeError } from '../recipes/errors/unknown-recipe.error';
import type { NewRecipe } from '../recipes/interfaces/new-recipe.interface';
import type { RecipeRepository } from '../recipes/interfaces/recipe-repository.interface';
import type { RecipeSearchDocument } from '../recipes/interfaces/recipe-search-document.interface';

export function newRecipe(id: string, title = 'Texas Sheet Cake', sha256 = `hash_${id}`): NewRecipe {
  return {
    id,
    title,
    draftMarkdown: `# ${title}\n\n## Ingredients\n\n- 2 cups flour`,
    ocrLines: [{ text: '2 cups flour', confidence: 0.9, pageNumber: 1 }],
    pages: [{ pageNumber: 1, originalPath: `recipes/${id}/original.jpg`, displayPath: `recipes/${id}/display.jpg`, sha256 }],
    createdAt: '2026-11-23T10:00:00.000Z',
  };
}

export function searchDocument(title: string, ingredients: string): RecipeSearchDocument {
  return { title, ingredients, steps: 'Mix and bake.', notes: '' };
}

export function describeRecipeRepositoryContract(name: string, createRepository: () => RecipeRepository): void {
  describe(`${name} (RecipeRepository contract)`, () => {
    const CREATED_AT = '2026-11-23T10:00:00.000Z';
    const UPDATED_AT = '2026-11-23T11:00:00.000Z';
    const APPROVED_AT = '2026-11-23T12:00:00.000Z';
    let repository: RecipeRepository;

    beforeEach(() => {
      repository = createRepository();
    });

    it('creates a recipe needing review with its pages and OCR lines', () => {
      const recipe = newRecipe('rec_a');
      repository.create(recipe);
      expect(repository.findById('rec_a')).toEqual({
        id: 'rec_a',
        title: recipe.title,
        status: 'needs_review',
        draftMarkdown: recipe.draftMarkdown,
        approvedMarkdown: null,
        ocrLines: recipe.ocrLines,
        pages: recipe.pages,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        approvedAt: null,
      });
      expect(repository.findById('rec_missing')).toBeUndefined();
    });

    it('create refuses a duplicate id or photo hash', () => {
      repository.create(newRecipe('rec_a'));
      expect(() => repository.create(newRecipe('rec_a', 'Other', 'hash_other'))).toThrow(Error);
      expect(() => repository.create(newRecipe('rec_b', 'Other', 'hash_rec_a'))).toThrow(Error);
      expect(repository.findById('rec_b')).toBeUndefined();
    });

    it('saveDraft changes only the draft and title', () => {
      repository.create(newRecipe('rec_a'));
      repository.saveDraft('rec_a', '# Cake', 'Cake', UPDATED_AT);
      const stored = repository.findById('rec_a');
      expect(stored).toMatchObject({
        title: 'Cake',
        draftMarkdown: '# Cake',
        status: 'needs_review',
        approvedMarkdown: null,
        updatedAt: UPDATED_AT,
        createdAt: CREATED_AT,
      });
      expect(stored?.pages).toEqual(newRecipe('rec_a').pages);
    });

    it('approve sets both copies and the status; a later saveDraft marks hasPendingEdit', () => {
      repository.create(newRecipe('rec_a'));
      repository.approve('rec_a', '# Sheet Cake', 'Sheet Cake', searchDocument('Sheet Cake', '2 cups flour'), APPROVED_AT);
      expect(repository.findById('rec_a')).toMatchObject({
        title: 'Sheet Cake',
        status: 'approved',
        draftMarkdown: '# Sheet Cake',
        approvedMarkdown: '# Sheet Cake',
        approvedAt: APPROVED_AT,
      });
      expect(repository.listSummaries()).toEqual([
        { id: 'rec_a', title: 'Sheet Cake', status: 'approved', hasPendingEdit: false },
      ]);
      repository.saveDraft('rec_a', '# Sheet Cake v2', 'Sheet Cake', UPDATED_AT);
      expect(repository.listSummaries()[0].hasPendingEdit).toBe(true);
    });

    it('saveDraft keeps the approved title once the recipe has been approved', () => {
      repository.create(newRecipe('rec_a'));
      repository.approve('rec_a', '# Cake', 'Cake', searchDocument('Cake', 'flour'), APPROVED_AT);
      repository.saveDraft('rec_a', '# Pie', 'Pie', UPDATED_AT);
      expect(repository.findById('rec_a')).toMatchObject({ title: 'Cake', draftMarkdown: '# Pie' });
      expect(repository.listSummaries()[0].title).toBe('Cake');
    });

    it('resetDraftToApproved clears the pending edit and restores the approved title', () => {
      repository.create(newRecipe('rec_a'));
      repository.approve('rec_a', '# Cake', 'Cake', searchDocument('Cake', 'flour'), APPROVED_AT);
      repository.saveDraft('rec_a', '# Cake v2', 'Cake v2', UPDATED_AT);
      repository.resetDraftToApproved('rec_a', 'Approved Cake', UPDATED_AT);
      expect(repository.findById('rec_a')).toMatchObject({
        title: 'Approved Cake',
        draftMarkdown: '# Cake',
        approvedMarkdown: '# Cake',
      });
      expect(repository.listSummaries()[0].hasPendingEdit).toBe(false);
    });

    it('lists summaries sorted by title, case-insensitive', () => {
      repository.create(newRecipe('rec_b', 'banana bread'));
      repository.create(newRecipe('rec_a', 'Apple Pie'));
      repository.create(newRecipe('rec_c', 'Carrot Cake'));
      expect(repository.listSummaries().map((summary) => summary.title)).toEqual([
        'Apple Pie',
        'banana bread',
        'Carrot Cake',
      ]);
    });

    it('remove deletes the recipe and frees its photo hashes', () => {
      repository.create(newRecipe('rec_a'));
      repository.approve('rec_a', '# Cake', 'Cake', searchDocument('Cake', 'flour'), APPROVED_AT);
      repository.remove('rec_a');
      expect(repository.findById('rec_a')).toBeUndefined();
      expect(repository.hasPhotoHash('hash_rec_a')).toBe(false);
      expect(repository.search('flour')).toEqual([]);
      expect(() => repository.create(newRecipe('rec_b', 'Again', 'hash_rec_a'))).not.toThrow();
    });

    it("hasPhotoHash finds a stored page's hash", () => {
      repository.create(newRecipe('rec_a'));
      expect(repository.hasPhotoHash('hash_rec_a')).toBe(true);
      expect(repository.hasPhotoHash('hash_other')).toBe(false);
    });

    it('countByStatus counts each status', () => {
      expect(repository.countByStatus()).toEqual({ needsReview: 0, approved: 0 });
      repository.create(newRecipe('rec_a'));
      repository.create(newRecipe('rec_b'));
      repository.approve('rec_b', '# Cake', 'Cake', searchDocument('Cake', 'flour'), APPROVED_AT);
      expect(repository.countByStatus()).toEqual({ needsReview: 1, approved: 1 });
    });

    it('stores and returns only the latest scan report', () => {
      expect(repository.latestScanReport()).toBeNull();
      repository.saveScanReport({ finishedAt: CREATED_AT, importedCount: 2, problems: [] });
      const latest = {
        finishedAt: UPDATED_AT,
        importedCount: 1,
        problems: [{ subject: 'IMG_1.jpg', reason: 'Could not read text.' }],
      };
      repository.saveScanReport(latest);
      expect(repository.latestScanReport()).toEqual(latest);
    });

    it('throws UnknownRecipeError for an unknown id', () => {
      expect(() => repository.saveDraft('rec_x', 'd', 't', UPDATED_AT)).toThrow(UnknownRecipeError);
      expect(() => repository.approve('rec_x', 'm', 't', searchDocument('t', 'i'), APPROVED_AT)).toThrow(
        UnknownRecipeError,
      );
      expect(() => repository.resetDraftToApproved('rec_x', 't', UPDATED_AT)).toThrow(UnknownRecipeError);
      expect(() => repository.remove('rec_x')).toThrow(UnknownRecipeError);
    });

    it('search finds approved recipes only, by a word in an ingredient, and returns [] for punctuation-only queries', () => {
      repository.create(newRecipe('rec_a', 'Texas Sheet Cake'));
      repository.create(newRecipe('rec_b', 'Pending Pie', 'hash_b'));
      repository.approve(
        'rec_a',
        '# Texas Sheet Cake',
        'Texas Sheet Cake',
        searchDocument('Texas Sheet Cake', '2 cups flour\n1 cup sugar\n1 tsp salt\n3 eggs'),
        APPROVED_AT,
      );
      repository.saveDraft('rec_b', '# Pending Pie flour', 'Pending Pie', UPDATED_AT);
      expect(repository.search('flour')).toEqual([
        { id: 'rec_a', title: 'Texas Sheet Cake', ingredientPreview: '2 cups flour, 1 cup sugar, 1 tsp salt' },
      ]);
      expect(repository.search('?!...')).toEqual([]);
      expect(repository.search('')).toEqual([]);
    });
  });
}
