export class DataDirectoryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataDirectoryUnavailableError';
  }
}
