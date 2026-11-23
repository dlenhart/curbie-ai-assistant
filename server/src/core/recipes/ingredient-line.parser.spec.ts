import { parseIngredientLine } from './ingredient-line.parser';

describe('parseIngredientLine', () => {
  it.each([
    ['2 cups flour', { kind: 'single', value: 2 }, 'cup', 'flour'],
    ['1 T cocoa', { kind: 'single', value: 1 }, 'tablespoon', 'cocoa'],
    ['1 t salt', { kind: 'single', value: 1 }, 'teaspoon', 'salt'],
    ['1 1/2 c sugar', { kind: 'single', value: 1.5 }, 'cup', 'sugar'],
    ['½ cup butter', { kind: 'single', value: 0.5 }, 'cup', 'butter'],
    ['1½ cups milk', { kind: 'single', value: 1.5 }, 'cup', 'milk'],
    ['2-3 cloves garlic', { kind: 'range', low: 2, high: 3 }, 'clove', 'garlic'],
    ['2 to 3 cloves garlic', { kind: 'range', low: 2, high: 3 }, 'clove', 'garlic'],
    ['1.5 lb beef', { kind: 'single', value: 1.5 }, 'pound', 'beef'],
    ['3 eggs', { kind: 'single', value: 3 }, null, 'eggs'],
    ['salt to taste', null, null, 'salt to taste'],
    ['1 (8 oz) package cream cheese', { kind: 'single', value: 1 }, null, '(8 oz) package cream cheese'],
    ['1 ½ cups flour', { kind: 'single', value: 1.5 }, 'cup', 'flour'],
    ['2 TBSP butter', { kind: 'single', value: 2 }, 'tablespoon', 'butter'],
    ['2 Tbsp. butter', { kind: 'single', value: 2 }, 'tablespoon', 'butter'],
    ['1 1/2-inch piece ginger', null, null, '1 1/2-inch piece ginger'],
    ['1/2-inch slices zucchini', null, null, '1/2-inch slices zucchini'],
    ['2-inch cinnamon stick', null, null, '2-inch cinnamon stick'],
    ['½-inch cubes bread', null, null, '½-inch cubes bread'],
    ['2 - 3 cloves garlic', { kind: 'range', low: 2, high: 3 }, 'clove', 'garlic'],
  ])('parses %s', (text, quantity, unit, item) => {
    const line = parseIngredientLine(text);
    expect(line.originalText).toBe(text);
    expect(line.quantity).toEqual(quantity);
    expect(line.unit).toBe(unit);
    expect(line.item).toBe(item);
  });

  it('keeps the text after the quantity as the remainder', () => {
    expect(parseIngredientLine('1 (8 oz) package cream cheese').remainder).toBe('(8 oz) package cream cheese');
    expect(parseIngredientLine('2 cups flour').remainder).toBe('cups flour');
  });
});
