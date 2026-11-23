export interface RecipeSection<T> {
  readonly heading: string | null;
  readonly items: readonly T[];
}
