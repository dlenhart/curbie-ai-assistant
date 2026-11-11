export class EmptyMessageError extends Error {
  constructor() {
    super('The message is empty.');
    this.name = 'EmptyMessageError';
  }
}
