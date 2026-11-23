export type Quantity =
  | { readonly kind: 'single'; readonly value: number }
  | { readonly kind: 'range'; readonly low: number; readonly high: number };
