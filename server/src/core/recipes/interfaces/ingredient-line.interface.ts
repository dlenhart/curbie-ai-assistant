import type { Quantity } from '../types/quantity.type';

export interface IngredientLine {
  readonly originalText: string;
  readonly quantity: Quantity | null;
  readonly unit: string | null;
  readonly remainder: string;
  readonly item: string;
}
