import { formatKitchenQuantity } from './kitchen-quantity.formatter';
import type { IngredientLine } from './interfaces/ingredient-line.interface';

export function scaleIngredientLine(line: IngredientLine, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError(`Scale factor must be a positive finite number, got ${factor}`);
  }
  const { quantity, unit } = line;
  if (quantity === null) {
    return `${line.originalText} (not scaled)`;
  }
  const scaledQuantity =
    quantity.kind === 'single'
      ? formatKitchenQuantity(quantity.value * factor, unit)
      : `${formatKitchenQuantity(quantity.low * factor, unit)}-${formatKitchenQuantity(quantity.high * factor, unit)}`;
  return line.remainder === '' ? scaledQuantity : `${scaledQuantity} ${line.remainder}`;
}
