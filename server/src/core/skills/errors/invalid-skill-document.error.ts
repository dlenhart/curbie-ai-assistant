export class InvalidSkillDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSkillDocumentError';
  }
}
