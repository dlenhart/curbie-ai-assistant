import { InvalidLineLabelsError } from './errors/invalid-line-labels.error';
import { validateLineLabels } from './line-labels.validator';

const validLabels = { title: [1], servings: 2, headings: [3], ingredients: [4, 5], steps: [6] };

describe('validateLineLabels', () => {
  it('accepts valid labels', () => {
    expect(validateLineLabels(validLabels, 6)).toEqual(validLabels);
  });

  it('accepts null servings', () => {
    expect(validateLineLabels({ ...validLabels, servings: null }, 6).servings).toBeNull();
  });

  it.each([
    ['a number 0', { ...validLabels, title: [0] }],
    ['a number above the line count', { ...validLabels, steps: [7] }],
    ['a line in two lists', { ...validLabels, steps: [4] }],
    ['a servings number out of range', { ...validLabels, servings: 7 }],
    ['a servings number also in another list', { ...validLabels, servings: 4 }],
    ['a duplicate inside one list', { ...validLabels, ingredients: [4, 4] }],
    ['no steps', { ...validLabels, steps: [] }],
    ['no ingredients', { ...validLabels, ingredients: [] }],
    ['an extra property', { ...validLabels, extra: [1] }],
  ])('rejects %s', (_name, labels) => {
    expect(() => validateLineLabels(labels, 6)).toThrow(InvalidLineLabelsError);
  });
});
