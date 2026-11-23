import { parseRecipeMarkdown } from './recipe-markdown.parser';
import { buildRecipeSearchDocument } from './recipe-search-document.builder';

const MARKDOWN = `# Texas Sheet Cake
## Ingredients
### Cake
- 2 cups flour
### Frosting
- 1 T cocoa
## Steps
### Cake
1. Heat oven to 350.
## Notes
Grandma used Crisco.
`;

describe('buildRecipeSearchDocument', () => {
  it('includes section headings, ingredient text, steps, and notes', () => {
    const document = buildRecipeSearchDocument(parseRecipeMarkdown(MARKDOWN).recipe);

    expect(document).toEqual({
      title: 'Texas Sheet Cake',
      ingredients: 'Cake\n2 cups flour\nFrosting\n1 T cocoa',
      steps: 'Cake\nHeat oven to 350.',
      notes: 'Grandma used Crisco.',
    });
  });

  it('uses an empty title when the recipe has none', () => {
    const document = buildRecipeSearchDocument(parseRecipeMarkdown('## Ingredients\n- 1 egg').recipe);

    expect(document.title).toBe('');
    expect(document.ingredients).toBe('1 egg');
  });
});
