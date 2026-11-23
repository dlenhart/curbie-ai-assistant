import { formatKitchenQuantity } from './kitchen-quantity.formatter';

describe('formatKitchenQuantity', () => {
  it.each([
    [1.5, null, '1 1/2'],
    [0.6667, null, '2/3'],
    [0.0625, null, '1/8'],
    [2, null, '2'],
    [2.97, null, '3'],
    [375.4, 'milliliter', '375'],
    [0.2, 'gram', '1'],
    [1.5, 'kilogram', '1.5'],
    [0.5, 'liter', '0.5'],
    [1.234, 'liter', '1.23'],
    [0.001, 'kilogram', '0.01'],
  ])('formats %s (unit %s) as %s', (value, unit, expected) => {
    expect(formatKitchenQuantity(value, unit)).toBe(expected);
  });

  it.each([0, -1, NaN, Infinity])('throws RangeError for %s', (value) => {
    expect(() => formatKitchenQuantity(value, null)).toThrow(RangeError);
  });
});
