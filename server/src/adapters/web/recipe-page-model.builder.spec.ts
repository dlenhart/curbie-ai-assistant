import { MAX_RECIPE_MARKDOWN_LENGTH, RECIPE_PAGE_MESSAGES, RECIPE_PROBLEM_MESSAGES } from '../../constants';
import type { StoredRecipe } from '../../core/recipes/interfaces/stored-recipe.interface';
import {
  buildRecipeReviewPageModel,
  buildRecipesPageModel,
  buildRecipeViewPageModel,
  findRecipePageMessage,
} from './recipe-page-model.builder';

const DRAFT_WITH_UNSORTED = [
  '# Sheet Cake',
  '',
  '## Ingredients',
  '- 2 cups flour',
  '- salt',
  '',
  '## Steps',
  '1. Bake.',
  '',
  '## Unsorted',
  'Grandma',
  '',
].join('\n');

const CLEAN_MARKDOWN = ['# Sheet Cake', '', '## Ingredients', '- 2 cups flour', '', '## Steps', '1. Bake.', ''].join('\n');

const DRAFT_RECIPE: StoredRecipe = {
  id: 'recipe_7',
  title: 'Sheet Cake',
  status: 'needs_review',
  draftMarkdown: DRAFT_WITH_UNSORTED,
  approvedMarkdown: null,
  ocrLines: [
    { text: 'Sheet Cake', confidence: 0.98, pageNumber: 1 },
    { text: '2 cups flour', confidence: 0.49, pageNumber: 1 },
    { text: 'Bake.', confidence: 0.5, pageNumber: 2 },
  ],
  pages: [
    { pageNumber: 1, originalPath: 'originals/recipes/recipe_7/page-1.jpg', displayPath: 'originals/recipes/recipe_7/page-1.display.jpg', sha256: 'a' },
    { pageNumber: 2, originalPath: 'originals/recipes/recipe_7/page-2.jpg', displayPath: 'originals/recipes/recipe_7/page-2.display.jpg', sha256: 'b' },
  ],
  createdAt: '2026-11-23T12:00:00.000Z',
  updatedAt: '2026-11-23T12:00:00.000Z',
  approvedAt: null,
};

const APPROVED_RECIPE: StoredRecipe = {
  ...DRAFT_RECIPE,
  status: 'approved',
  draftMarkdown: DRAFT_WITH_UNSORTED,
  approvedMarkdown: CLEAN_MARKDOWN,
  approvedAt: '2026-11-23T13:00:00.000Z',
};

describe('buildRecipeReviewPageModel', () => {
  it('formats problems with line numbers', () => {
    const model = buildRecipeReviewPageModel(DRAFT_RECIPE, null);
    expect(model.problems).toEqual([`Line 10: ${RECIPE_PROBLEM_MESSAGES.unsortedPresent}`]);
  });

  it('formats warnings with line numbers', () => {
    const model = buildRecipeReviewPageModel(DRAFT_RECIPE, null);
    expect(model.warnings).toEqual([`Line 5: ${RECIPE_PROBLEM_MESSAGES.noQuantity}`]);
  });

  it('shows a problem without a line number as just the message', () => {
    const model = buildRecipeReviewPageModel({ ...DRAFT_RECIPE, draftMarkdown: '# Sheet Cake\n\n## Steps\n1. Bake.\n' }, null);
    expect(model.problems).toContain(RECIPE_PROBLEM_MESSAGES.noIngredients);
  });

  it('marks OCR lines below the threshold', () => {
    expect(buildRecipeReviewPageModel(DRAFT_RECIPE, null).ocrLines).toEqual([
      { number: 1, text: 'Sheet Cake', isLowConfidence: false },
      { number: 2, text: '2 cups flour', isLowConfidence: true },
      { number: 3, text: 'Bake.', isLowConfidence: false },
    ]);
  });

  it('clears the low-confidence marks once the recipe is approved', () => {
    expect(buildRecipeReviewPageModel(APPROVED_RECIPE, null).ocrLines.map((line) => line.isLowConfidence)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('points the review page at its confirmation script', () => {
    expect(buildRecipeReviewPageModel(DRAFT_RECIPE, null).scriptPath).toBe('/static/recipe-review.js');
  });

  it('builds image hrefs from the stored id and page numbers', () => {
    expect(buildRecipeReviewPageModel(DRAFT_RECIPE, null).pageImages).toEqual([
      { href: '/recipes/recipe_7/pages/1', label: 'Page 1' },
      { href: '/recipes/recipe_7/pages/2', label: 'Page 2' },
    ]);
  });

  it('carries the stored draft, id, title, status message, and Manage navigation', () => {
    const model = buildRecipeReviewPageModel(DRAFT_RECIPE, RECIPE_PAGE_MESSAGES.saved);
    expect(model.recipeId).toBe('recipe_7');
    expect(model.title).toBe('Sheet Cake');
    expect(model.draftMarkdown).toBe(DRAFT_WITH_UNSORTED);
    expect(model.statusMessage).toBe(RECIPE_PAGE_MESSAGES.saved);
    expect(model.isApproved).toBe(false);
    expect(model.hasPendingEdit).toBe(false);
    expect(model.pageTitle).toBe('Curbie · Sheet Cake');
    expect(model.navigation.find((link) => link.isActive)?.label).toBe('MANAGE');
  });

  it('flags an approved recipe whose draft differs from the approved copy as a pending edit', () => {
    const model = buildRecipeReviewPageModel(APPROVED_RECIPE, null);
    expect(model.isApproved).toBe(true);
    expect(model.hasPendingEdit).toBe(true);
    expect(buildRecipeReviewPageModel({ ...APPROVED_RECIPE, draftMarkdown: CLEAN_MARKDOWN }, null).hasPendingEdit).toBe(false);
  });
});

describe('buildRecipeViewPageModel', () => {
  it('shows the approved copy with the page images and the Chat navigation', () => {
    const model = buildRecipeViewPageModel(APPROVED_RECIPE);
    expect(model.title).toBe('Sheet Cake');
    expect(model.approvedMarkdown).toBe(CLEAN_MARKDOWN);
    expect(model.pageImages.map((image) => image.href)).toEqual(['/recipes/recipe_7/pages/1', '/recipes/recipe_7/pages/2']);
    expect(model.navigation.find((link) => link.isActive)?.label).toBe('CHAT');
  });
});

describe('buildRecipesPageModel', () => {
  const summaries = [
    { id: 'recipe_1', title: 'Sheet Cake', status: 'needs_review' as const, hasPendingEdit: false },
    { id: 'recipe_2', title: 'Chili', status: 'approved' as const, hasPendingEdit: true },
  ];

  it('splits the summaries into needs review and approved, and lists the last scan problems', () => {
    const model = buildRecipesPageModel({
      summaries,
      scanReport: { finishedAt: '2026-11-23T12:00:00.000Z', importedCount: 1, problems: [{ subject: 'blurry', reason: 'No text.' }] },
      isScanRunning: false,
      statusFlag: undefined,
    });
    expect(model.needsReview.map((summary) => summary.id)).toEqual(['recipe_1']);
    expect(model.approved.map((summary) => summary.id)).toEqual(['recipe_2']);
    expect(model.scanProblems).toEqual([{ subject: 'blurry', reason: 'No text.' }]);
    expect(model.statusMessage).toBeNull();
    expect(model.navigation.find((link) => link.isActive)?.label).toBe('MANAGE');
  });

  it('maps a known status flag to its fixed message', () => {
    const model = buildRecipesPageModel({ summaries, scanReport: null, isScanRunning: false, statusFlag: 'approved' });
    expect(model.statusMessage).toBe(RECIPE_PAGE_MESSAGES.approved);
    expect(model.scanProblems).toEqual([]);
  });

  it('says a scan is running when no flag is given', () => {
    const model = buildRecipesPageModel({ summaries, scanReport: null, isScanRunning: true, statusFlag: undefined });
    expect(model.isScanRunning).toBe(true);
    expect(model.statusMessage).toBe(RECIPE_PAGE_MESSAGES.scanRunning);
  });

  it('includes the filter script through the shared script path', () => {
    const model = buildRecipesPageModel({ summaries, scanReport: null, isScanRunning: false, statusFlag: undefined });
    expect(model.scriptPath).toBe('/static/recipes.js');
  });
});

describe('RECIPE_PAGE_MESSAGES', () => {
  it('states the markdown limit from MAX_RECIPE_MARKDOWN_LENGTH', () => {
    expect(RECIPE_PAGE_MESSAGES.invalidMarkdown).toContain(MAX_RECIPE_MARKDOWN_LENGTH.toLocaleString('en-US'));
  });
});

describe('findRecipePageMessage', () => {
  it('maps unknown status flags to null', () => {
    expect(findRecipePageMessage('<script>')).toBeNull();
    expect(findRecipePageMessage('toString')).toBeNull();
    expect(findRecipePageMessage(['saved'])).toBeNull();
    expect(findRecipePageMessage(undefined)).toBeNull();
  });

  it('maps known flags to their fixed messages', () => {
    expect(findRecipePageMessage('saved')).toBe(RECIPE_PAGE_MESSAGES.saved);
    expect(findRecipePageMessage('notApproved')).toBe(RECIPE_PAGE_MESSAGES.notApproved);
  });
});
