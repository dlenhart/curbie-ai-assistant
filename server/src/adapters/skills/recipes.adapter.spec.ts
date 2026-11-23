import { parseRecipeMarkdown } from '../../core/recipes/recipe-markdown.parser';
import { buildRecipeSearchDocument } from '../../core/recipes/recipe-search-document.builder';
import { InMemoryRecipeRepository } from '../../core/testing/in-memory-recipe.repository';
import { RecipeToolError } from './errors/recipe-tool.error';
import { RecipesAdapter } from './recipes.adapter';

const SHEET_CAKE_MARKDOWN = [
  '# Texas Sheet Cake',
  'Serves: 24',
  '',
  '## Ingredients',
  '- 2 cups flour',
  '- 1 T cocoa',
  '',
  '## Steps',
  '1. Bake at 350.',
  '',
].join('\n');

const TOAST_MARKDOWN = '# Toast\nServes: 6-8\n## Ingredients\n- 2 slices bread\n## Steps\n1. Toast it.';

function createRepository(): InMemoryRecipeRepository {
  const repository = new InMemoryRecipeRepository();
  addApprovedRecipe(repository, 'recipe_1', SHEET_CAKE_MARKDOWN);
  repository.saveDraft('recipe_1', '# Texas Sheet Cake\nUnfinished edit', 'Texas Sheet Cake', '2026-11-23T13:00:00.000Z');
  repository.create(newRecipe('recipe_2', '# Fudge\n## Ingredients\n- 1 cup sugar'));
  addApprovedRecipe(repository, 'recipe_3', TOAST_MARKDOWN);
  return repository;
}

function newRecipe(id: string, draftMarkdown: string) {
  return {
    id,
    title: parseRecipeMarkdown(draftMarkdown).recipe.title ?? '',
    draftMarkdown,
    ocrLines: [],
    pages: [
      {
        pageNumber: 1,
        originalPath: `originals/${id}/page-1.jpg`,
        displayPath: `display/${id}/page-1.jpg`,
        sha256: `hash_${id}`,
      },
    ],
    createdAt: '2026-11-23T12:00:00.000Z',
  };
}

function addApprovedRecipe(repository: InMemoryRecipeRepository, id: string, markdown: string): void {
  repository.create(newRecipe(id, markdown));
  const parsed = parseRecipeMarkdown(markdown).recipe;
  repository.approve(id, markdown, parsed.title ?? '', buildRecipeSearchDocument(parsed), '2026-11-23T12:30:00.000Z');
}

describe('RecipesAdapter', () => {
  const adapter = new RecipesAdapter(createRepository());

  it('search returns id, title, preview lines', async () => {
    await expect(adapter.execute('search_recipes', { query: 'sheet cake' })).resolves.toEqual({
      title: 'Recipe search',
      content: 'recipe_1 | Texas Sheet Cake | 2 cups flour, 1 T cocoa',
      requiresQuote: false,
    });
    const none = await adapter.execute('search_recipes', { query: 'lasagna' });
    expect(none.content).toBe('No approved recipes match "lasagna".');
    expect(none.card).toBeUndefined();
  });

  it('get_recipe returns the approved copy with card and href', async () => {
    await expect(adapter.execute('get_recipe', { recipe_id: 'recipe_1' })).resolves.toEqual({
      title: 'Recipe: Texas Sheet Cake',
      content: SHEET_CAKE_MARKDOWN,
      requiresQuote: false,
      href: '/recipes/recipe_1',
      card: { heading: 'Texas Sheet Cake', body: SHEET_CAKE_MARKDOWN, href: '/recipes/recipe_1' },
    });
  });

  it('get_recipe refuses a draft', async () => {
    await expect(adapter.execute('get_recipe', { recipe_id: 'recipe_2' })).rejects.toThrow(
      new RecipeToolError('No approved recipe with id "recipe_2".'),
    );
    await expect(adapter.execute('get_recipe', { recipe_id: 'recipe_404' })).rejects.toThrow(RecipeToolError);
  });

  it('scale_recipe by factor and by servings', async () => {
    const doubled = await adapter.execute('scale_recipe', { recipe_id: 'recipe_1', factor: 2 });
    expect(doubled.content).toBe(
      SHEET_CAKE_MARKDOWN.replace('Serves: 24', 'Serves: 48').replace('2 cups', '4 cups').replace('1 T', '2 T'),
    );
    expect(doubled.href).toBe('/recipes/recipe_1');
    expect(doubled.requiresQuote).toBe(false);
    expect(doubled.card).toEqual({ heading: 'Texas Sheet Cake · doubled', body: doubled.content, href: '/recipes/recipe_1' });

    const halved = await adapter.execute('scale_recipe', { recipe_id: 'recipe_1', servings: 12 });
    expect(halved.card?.heading).toBe('Texas Sheet Cake · halved');
    expect(halved.content).toContain('Serves: 12');
    expect(halved.content).toContain('- 1 cups flour');

    const eight = await adapter.execute('scale_recipe', { recipe_id: 'recipe_1', servings: 8 });
    expect(eight.card?.heading).toBe('Texas Sheet Cake · ×0.33');
    expect(eight.content).toContain('Serves: 8');

    const oneAndAHalf = await adapter.execute('scale_recipe', { recipe_id: 'recipe_3', factor: 1.5 });
    expect(oneAndAHalf.card?.heading).toBe('Toast · ×1.5');
    expect(oneAndAHalf.content).toContain('Serves: 9-12');
  });

  it('rejects both or neither of factor and servings, a factor of 25, and servings on a range recipe', async () => {
    const attempts: Array<Record<string, unknown>> = [
      { recipe_id: 'recipe_1', factor: 2, servings: 12 },
      { recipe_id: 'recipe_1' },
      { recipe_id: 'recipe_1', factor: 25 },
      { recipe_id: 'recipe_1', factor: 0 },
      { recipe_id: 'recipe_3', servings: 12 },
      { recipe_id: 'recipe_2', factor: 2 },
    ];
    for (const attempt of attempts) {
      await expect(adapter.execute('scale_recipe', attempt)).rejects.toThrow(RecipeToolError);
    }
  });

  it('rejects servings that are not a positive integer', async () => {
    for (const servings of [2.5, 0, -4]) {
      await expect(adapter.execute('scale_recipe', { recipe_id: 'recipe_1', servings })).rejects.toThrow(
        new RecipeToolError('servings must be a whole number of at least 1.'),
      );
    }
  });

  it('rejects a blank query or recipe id', async () => {
    await expect(adapter.execute('search_recipes', { query: '' })).rejects.toThrow(RecipeToolError);
    await expect(adapter.execute('search_recipes', { query: '   ' })).rejects.toThrow(RecipeToolError);
    await expect(adapter.execute('get_recipe', { recipe_id: ' ' })).rejects.toThrow(
      new RecipeToolError('recipe_id must be a non-blank string.'),
    );
    await expect(adapter.execute('scale_recipe', { recipe_id: '', factor: 2 })).rejects.toThrow(RecipeToolError);
  });

  it('rejects an unknown tool name', async () => {
    await expect(adapter.execute('delete_recipe', {})).rejects.toThrow(RecipeToolError);
  });
});
