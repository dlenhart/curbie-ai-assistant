export class OcrFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrFailedError';
  }
}
