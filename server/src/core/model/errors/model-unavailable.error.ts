export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}
