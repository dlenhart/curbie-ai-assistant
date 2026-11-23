export class UnknownRecipeError extends Error {
  constructor(recipeId: string) {
    super(`Recipe ${recipeId} does not exist.`);
    this.name = 'UnknownRecipeError';
  }
}
