import { scaleRecipeMarkdown } from './recipe.scaler';

const TEXAS_SHEET_CAKE = [
  '# Texas Sheet Cake',
  'Serves: 24',
  '',
  '## Ingredients',
  '### Cake',
  '- 2 cups flour',
  '- 1/2 cup butter',
  '- salt to taste',
  '### Frosting',
  '- 1/2 cup butter',
  '- 1 T cocoa',
  '',
  '## Steps',
  '### Cake',
  '1. Heat oven to 350.',
  '- 2 pans, greased',
  '### Frosting',
  '1. Melt butter with cocoa.',
  '',
  '## Notes',
  'Grandma used Crisco.',
  '- 3 cups is too much',
  '',
].join('\n');

const DOUBLED_TEXAS_SHEET_CAKE = [
  '# Texas Sheet Cake',
  'Serves: 48',
  '',
  '## Ingredients',
  '### Cake',
  '- 4 cups flour',
  '- 1 cup butter',
  '- salt to taste (not scaled)',
  '### Frosting',
  '- 1 cup butter',
  '- 2 T cocoa',
  '',
  '## Steps',
  '### Cake',
  '1. Heat oven to 350.',
  '- 2 pans, greased',
  '### Frosting',
  '1. Melt butter with cocoa.',
  '',
  '## Notes',
  'Grandma used Crisco.',
  '- 3 cups is too much',
  '',
].join('\n');

describe('scaleRecipeMarkdown', () => {
  it('doubles the sheet cake, keeping sections, steps, and notes byte-for-byte', () => {
    expect(scaleRecipeMarkdown(TEXAS_SHEET_CAKE, 2)).toBe(DOUBLED_TEXAS_SHEET_CAKE);
  });

  it('scales Serves', () => {
    expect(scaleRecipeMarkdown(TEXAS_SHEET_CAKE, 0.5).split('\n')[1]).toBe('Serves: 12');
    expect(scaleRecipeMarkdown('# Toast\nServes: 6-8\n## Ingredients\n- 2 slices bread', 1.5)).toBe(
      '# Toast\nServes: 9-12\n## Ingredients\n- 3 slices bread',
    );
  });

  it('leaves a recipe without Serves unchanged outside the ingredients', () => {
    expect(scaleRecipeMarkdown('# Toast\n## Ingredients\n- 1 egg\n## Steps\n1. Cook.', 3)).toBe(
      '# Toast\n## Ingredients\n- 3 egg\n## Steps\n1. Cook.',
    );
  });

  it('scales CRLF input and returns LF lines', () => {
    expect(scaleRecipeMarkdown(TEXAS_SHEET_CAKE.replace(/\n/g, '\r\n'), 2)).toBe(DOUBLED_TEXAS_SHEET_CAKE);
  });

  it('refuses a factor that is not positive and finite', () => {
    expect(() => scaleRecipeMarkdown(TEXAS_SHEET_CAKE, 0)).toThrow(RangeError);
    expect(() => scaleRecipeMarkdown(TEXAS_SHEET_CAKE, Number.NaN)).toThrow(RangeError);
  });
});
