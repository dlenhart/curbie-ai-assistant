export class RecipeStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeStateError';
  }
}
