import { KITCHEN_FRACTIONS, RECIPE_DECIMAL_METRIC_UNITS, RECIPE_WHOLE_NUMBER_METRIC_UNITS } from '../../constants';

export function formatKitchenQuantity(value: number, unit: string | null): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Quantity must be a positive finite number, got ${value}`);
  }
  if (unit !== null && RECIPE_WHOLE_NUMBER_METRIC_UNITS.has(unit)) {
    return String(Math.max(1, Math.round(value)));
  }
  if (unit !== null && RECIPE_DECIMAL_METRIC_UNITS.has(unit)) {
    return String(Math.max(0.01, Math.round(value * 100) / 100));
  }
  return formatFraction(value);
}

function formatFraction(value: number): string {
  const wholePart = Math.floor(value);
  const remainder = value - wholePart;
  let nearest: (typeof KITCHEN_FRACTIONS)[number] = KITCHEN_FRACTIONS[0];
  for (const entry of KITCHEN_FRACTIONS) {
    if (Math.abs(entry[0] - remainder) < Math.abs(nearest[0] - remainder)) {
      nearest = entry;
    }
  }
  const whole = nearest[0] === 1 ? wholePart + 1 : wholePart;
  const fraction = nearest[1];
  if (whole === 0 && fraction === '') {
    return KITCHEN_FRACTIONS[1][1];
  }
  if (whole === 0) {
    return fraction;
  }
  return fraction === '' ? String(whole) : `${whole} ${fraction}`;
}
