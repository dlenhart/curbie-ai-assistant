export class MalformedAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedAnswerError';
  }
}
