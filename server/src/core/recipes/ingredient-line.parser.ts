import { RECIPE_QUANTITY_PATTERN, RECIPE_UNIT_ALIASES, UNICODE_FRACTIONS } from '../../constants';
import type { IngredientLine } from './interfaces/ingredient-line.interface';
import type { Quantity } from './types/quantity.type';

export function parseIngredientLine(text: string): IngredientLine {
  const match = RECIPE_QUANTITY_PATTERN.exec(text);
  if (!match) {
    return { originalText: text, quantity: null, unit: null, remainder: text, item: text };
  }
  const quantity = buildQuantity(match[1], match[2]);
  const remainder = text.slice(match[0].length).trimStart();
  const unitMatch = /^(\S+)\s*(.*)$/.exec(remainder);
  const unit = unitMatch ? lookUpUnit(unitMatch[1]) : null;
  const item = unit && unitMatch ? unitMatch[2] : remainder;
  return {
    originalText: text,
    quantity,
    unit,
    remainder,
    item,
  };
}

function buildQuantity(firstToken: string, secondToken: string | undefined): Quantity {
  const first = parseToken(firstToken);
  if (secondToken === undefined) {
    return { kind: 'single', value: first };
  }
  return { kind: 'range', low: first, high: parseToken(secondToken) };
}

function parseToken(token: string): number {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(token);
  if (mixed) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(token);
  if (fraction) {
    return Number(fraction[1]) / Number(fraction[2]);
  }
  const lastCharacter = token.slice(-1);
  if (lastCharacter in UNICODE_FRACTIONS) {
    const wholeText = token.slice(0, -1).trim();
    return (wholeText === '' ? 0 : Number(wholeText)) + UNICODE_FRACTIONS[lastCharacter];
  }
  return Number(token);
}

function lookUpUnit(word: string): string | null {
  const stripped = word.replace(/\.$/, '');
  if (Object.prototype.hasOwnProperty.call(RECIPE_UNIT_ALIASES, stripped)) {
    return RECIPE_UNIT_ALIASES[stripped];
  }
  const lowered = stripped.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(RECIPE_UNIT_ALIASES, lowered)) {
    return RECIPE_UNIT_ALIASES[lowered];
  }
  return null;
}
