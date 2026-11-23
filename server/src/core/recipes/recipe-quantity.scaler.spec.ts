import { parseIngredientLine } from './ingredient-line.parser';
import { scaleIngredientLine } from './recipe-quantity.scaler';

describe('scaleIngredientLine', () => {
  it.each([
    ['1/3 cup oil', 2, '2/3 cup oil'],
    ['1/8 t salt', 0.5, '1/8 t salt'],
    ['2-3 cloves garlic', 2, '4-6 cloves garlic'],
    ['salt to taste', 2, 'salt to taste (not scaled)'],
    ['250 ml milk', 1.5, '375 ml milk'],
    ['1 T cocoa', 3, '3 T cocoa'],
    ['1 ½ cups flour', 2, '3 cups flour'],
    ['1.5 kg', 1, '1.5 kg'],
    ['0.25 l', 2, '0.5 l'],
    ['250 ml', 1.5, '375 ml'],
    ['1-2 l stock', 2, '2-4 l stock'],
    ['2', 2, '4'],
    ['1 1/2-inch piece ginger', 2, '1 1/2-inch piece ginger (not scaled)'],
    ['1/2-inch slices zucchini', 2, '1/2-inch slices zucchini (not scaled)'],
    ['2-inch cinnamon stick', 2, '2-inch cinnamon stick (not scaled)'],
  ])('scales %s by %s', (text, factor, expected) => {
    expect(scaleIngredientLine(parseIngredientLine(text), factor)).toBe(expected);
  });

  it.each([0, -1, NaN, Infinity])('throws RangeError for factor %s', (factor) => {
    expect(() => scaleIngredientLine(parseIngredientLine('2 cups flour'), factor)).toThrow(RangeError);
  });
});
