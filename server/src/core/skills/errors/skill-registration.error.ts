export class SkillRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillRegistrationError';
  }
}
