import {
  RECIPE_ITEM_PATTERN,
  RECIPE_KNOWN_BLOCKS,
  RECIPE_SERVES_PATTERN,
  RECIPE_SERVES_VALUE_PATTERN,
} from '../../constants';
import { parseIngredientLine } from './ingredient-line.parser';
import { formatKitchenQuantity } from './kitchen-quantity.formatter';
import { scaleIngredientLine } from './recipe-quantity.scaler';

export function scaleRecipeMarkdown(markdown: string, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError(`Scale factor must be a positive finite number, got ${factor}`);
  }
  let isBeforeFirstBlock = true;
  let isInIngredients = false;
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith('## ')) {
        isBeforeFirstBlock = false;
        isInIngredients = RECIPE_KNOWN_BLOCKS[line.slice(3).trim().toLowerCase()] === 'ingredients';
        return line;
      }
      if (isBeforeFirstBlock) return scaleServesLine(line, factor);
      if (!isInIngredients) return line;
      const itemMatch = RECIPE_ITEM_PATTERN.exec(line.trimEnd());
      if (!itemMatch) return line;
      return `- ${scaleIngredientLine(parseIngredientLine(itemMatch[1].trim()), factor)}`;
    })
    .join('\n');
}

function scaleServesLine(line: string, factor: number): string {
  const servesMatch = RECIPE_SERVES_PATTERN.exec(line.trimEnd());
  if (!servesMatch) return line;
  const valueMatch = RECIPE_SERVES_VALUE_PATTERN.exec(servesMatch[1].trim());
  if (!valueMatch || Number(valueMatch[1]) === 0) return line;
  const low = formatKitchenQuantity(Number(valueMatch[1]) * factor, null);
  if (valueMatch[2] === undefined) return `Serves: ${low}`;
  return `Serves: ${low}-${formatKitchenQuantity(Number(valueMatch[2]) * factor, null)}`;
}
