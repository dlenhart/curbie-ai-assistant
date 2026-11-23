export class RecipeToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeToolError';
  }
}
