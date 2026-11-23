import { RECIPE_PROBLEM_MESSAGES } from '../../constants';
import { parseRecipeMarkdown } from './recipe-markdown.parser';

const TEXAS_SHEET_CAKE = `# Texas Sheet Cake
Serves: 24

## Ingredients
### Cake
- 2 cups flour
- 1/2 cup butter
### Frosting
- 1/2 cup butter
- 1 T cocoa

## Steps
### Cake
1. Heat oven to 350.
### Frosting
1. Melt butter with cocoa.

## Notes
Grandma used Crisco.
`;

describe('parseRecipeMarkdown', () => {
  it('parses the Texas sheet cake example with Cake and Frosting sections', () => {
    const result = parseRecipeMarkdown(TEXAS_SHEET_CAKE);

    expect(result.problems).toEqual([]);
    expect(result.recipe.title).toBe('Texas Sheet Cake');
    expect(result.recipe.servings).toEqual({ kind: 'single', value: 24 });
    expect(result.recipe.ingredientSections.map((section) => section.heading)).toEqual(['Cake', 'Frosting']);
    expect(result.recipe.ingredientSections[0].items.map((line) => line.originalText)).toEqual([
      '2 cups flour',
      '1/2 cup butter',
    ]);
    expect(result.recipe.ingredientSections[1].items[1].unit).toBe('tablespoon');
    expect(result.recipe.stepSections).toEqual([
      { heading: 'Cake', items: ['Heat oven to 350.'] },
      { heading: 'Frosting', items: ['Melt butter with cocoa.'] },
    ]);
    expect(result.recipe.notes).toBe('Grandma used Crisco.');
  });

  it('parses a recipe with no sections', () => {
    const result = parseRecipeMarkdown(
      '# Toast\nServes: 6-8\n## Ingredients\n- 2 slices bread\n## Steps\n1. Toast it.\n2) Butter it.',
    );

    expect(result.problems).toEqual([]);
    expect(result.recipe.servings).toEqual({ kind: 'range', low: 6, high: 8 });
    expect(result.recipe.ingredientSections).toHaveLength(1);
    expect(result.recipe.ingredientSections[0].heading).toBeNull();
    expect(result.recipe.stepSections).toEqual([{ heading: null, items: ['Toast it.', 'Butter it.'] }]);
  });

  it('joins a plain line under a step onto that step', () => {
    const result = parseRecipeMarkdown('# T\n## Ingredients\n- 1 egg\n## Steps\n1. Whisk the eggs\nuntil frothy.\n2. Cook.');

    expect(result.problems).toEqual([]);
    expect(result.recipe.stepSections[0].items).toEqual(['Whisk the eggs until frothy.', 'Cook.']);
  });

  it('parses CRLF line endings, trailing spaces, and a lowercase heading the same as clean text', () => {
    const messy = TEXAS_SHEET_CAKE.replace(/\n/g, '  \r\n').replace('## Ingredients', '## ingredients');

    expect(parseRecipeMarkdown(messy)).toEqual(parseRecipeMarkdown(TEXAS_SHEET_CAKE));
  });

  it('reports a missing title, a second title, a bad Serves line, an unknown heading, and a stray line, each with its line number', () => {
    const missingTitle = parseRecipeMarkdown('Just text\n## Ingredients\n- 1 egg\n## Steps\n1. Go.');
    expect(missingTitle.problems).toContainEqual({ lineNumber: 1, message: RECIPE_PROBLEM_MESSAGES.missingTitle });

    const second = parseRecipeMarkdown('# A\n## Ingredients\n- 1 egg\n# B\n## Steps\n1. Go.');
    expect(second.problems).toEqual([{ lineNumber: 4, message: RECIPE_PROBLEM_MESSAGES.extraTitle }]);

    const badServings = parseRecipeMarkdown('# A\nServes: many\n## Ingredients\n- 1 egg\n## Steps\n1. Go.');
    expect(badServings.problems).toEqual([{ lineNumber: 2, message: RECIPE_PROBLEM_MESSAGES.badServings }]);

    const unknown = parseRecipeMarkdown('# A\n## Ingredients\n- 1 egg\n## Tips\nbe nice\n## Steps\n1. Go.');
    expect(unknown.problems).toEqual([{ lineNumber: 4, message: RECIPE_PROBLEM_MESSAGES.unknownHeading }]);

    const stray = parseRecipeMarkdown('# A\nhello\n## Ingredients\n- 1 egg\n## Steps\n1. Go.\n## Ingredients');
    expect(stray.problems).toEqual([
      { lineNumber: 2, message: RECIPE_PROBLEM_MESSAGES.strayLine },
      { lineNumber: 7, message: RECIPE_PROBLEM_MESSAGES.duplicateHeading },
    ]);

    const strayInIngredients = parseRecipeMarkdown('# A\n## Ingredients\nsome words\n- 1 egg\n## Steps\n1. Go.');
    expect(strayInIngredients.problems).toEqual([{ lineNumber: 3, message: RECIPE_PROBLEM_MESSAGES.strayLine }]);

    const strayStep = parseRecipeMarkdown('# A\n## Ingredients\n- 1 egg\n## Steps\nno number\n1. Go.');
    expect(strayStep.problems).toEqual([{ lineNumber: 5, message: RECIPE_PROBLEM_MESSAGES.strayLine }]);
  });

  it('reports Unsorted as a problem while it exists', () => {
    const result = parseRecipeMarkdown('# A\n## Ingredients\n- 1 egg\n## Steps\n1. Go.\n## Unsorted\nmystery line');

    expect(result.problems).toEqual([{ lineNumber: 6, message: RECIPE_PROBLEM_MESSAGES.unsortedPresent }]);
    expect(RECIPE_PROBLEM_MESSAGES.unsortedPresent).toBe('Move or delete every line under Unsorted.');
  });

  it('reports items before the first section in a sectioned block', () => {
    const result = parseRecipeMarkdown('# A\n## Ingredients\n- 1 egg\n### Sauce\n- 1 cup milk\n## Steps\n1. Go.');

    expect(result.problems).toEqual([{ lineNumber: 3, message: RECIPE_PROBLEM_MESSAGES.itemOutsideSection }]);
  });

  it('reports an empty recipe as missing title, ingredients, and steps', () => {
    const result = parseRecipeMarkdown('');

    expect(result.problems.map((problem) => problem.message)).toEqual([
      RECIPE_PROBLEM_MESSAGES.missingTitle,
      RECIPE_PROBLEM_MESSAGES.noIngredients,
      RECIPE_PROBLEM_MESSAGES.noSteps,
    ]);
    expect(result.recipe.title).toBeNull();
  });

  it('warns, without a problem, about an ingredient with no quantity', () => {
    const result = parseRecipeMarkdown('# A\n## Ingredients\n- 1 egg\n- salt to taste\n## Steps\n1. Go.');

    expect(result.problems).toEqual([]);
    expect(result.warnings).toEqual([{ lineNumber: 4, message: RECIPE_PROBLEM_MESSAGES.noQuantity }]);
  });

  it('reports Serves 0 and a reversed range as a bad Serves line', () => {
    const zero = parseRecipeMarkdown('# A\nServes: 0\n## Ingredients\n- 1 egg\n## Steps\n1. Go.');
    expect(zero.problems).toEqual([{ lineNumber: 2, message: RECIPE_PROBLEM_MESSAGES.badServings }]);

    const reversed = parseRecipeMarkdown('# A\nServes: 8-6\n## Ingredients\n- 1 egg\n## Steps\n1. Go.');
    expect(reversed.problems).toEqual([{ lineNumber: 2, message: RECIPE_PROBLEM_MESSAGES.badServings }]);
    expect(reversed.recipe.servings).toBeNull();
  });

  it('keeps note line breaks and inner blank lines, trimming only leading and trailing blanks', () => {
    const result = parseRecipeMarkdown(
      '# A\n## Ingredients\n- 1 egg\n## Steps\n1. Go.\n## Notes\n\nFirst line\nsecond line\n\nNew paragraph\n\n',
    );

    expect(result.recipe.notes).toBe('First line\nsecond line\n\nNew paragraph');
  });

  it('reports items before the first section in a sectioned steps block', () => {
    const result = parseRecipeMarkdown('# A\n## Ingredients\n- 1 egg\n## Steps\n1. Crack.\n### Cook\n1. Fry.');

    expect(result.problems).toEqual([{ lineNumber: 5, message: RECIPE_PROBLEM_MESSAGES.itemOutsideSection }]);
  });

  it('reports a Serves line that is not directly after the title as a stray line', () => {
    const afterBlank = parseRecipeMarkdown('# A\nhello\nServes: 4\n## Ingredients\n- 1 egg\n## Steps\n1. Go.');
    expect(afterBlank.problems).toEqual([
      { lineNumber: 2, message: RECIPE_PROBLEM_MESSAGES.strayLine },
      { lineNumber: 3, message: RECIPE_PROBLEM_MESSAGES.strayLine },
    ]);

    const twice = parseRecipeMarkdown('# A\nServes: 4\nServes: 5\n## Ingredients\n- 1 egg\n## Steps\n1. Go.');
    expect(twice.problems).toEqual([{ lineNumber: 3, message: RECIPE_PROBLEM_MESSAGES.strayLine }]);
    expect(twice.recipe.servings).toEqual({ kind: 'single', value: 4 });
  });

  it('reports only noIngredients when steps are present', () => {
    const result = parseRecipeMarkdown('# A\n## Steps\n1. Go.');

    expect(result.problems).toEqual([{ lineNumber: null, message: RECIPE_PROBLEM_MESSAGES.noIngredients }]);
  });

  it('reports only noSteps when ingredients are present', () => {
    const result = parseRecipeMarkdown('# A\n## Ingredients\n- 1 egg');

    expect(result.problems).toEqual([{ lineNumber: null, message: RECIPE_PROBLEM_MESSAGES.noSteps }]);
  });
});
