export class PathOutsideDataDirectoryError extends Error {
  constructor(relativePath: string) {
    super(`Path "${relativePath}" is outside the data directory.`);
    this.name = 'PathOutsideDataDirectoryError';
  }
}
