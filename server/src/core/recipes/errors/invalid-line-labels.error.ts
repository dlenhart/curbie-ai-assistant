export class InvalidLineLabelsError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'InvalidLineLabelsError';
  }
}
