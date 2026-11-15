import type { SettingsFieldErrors } from '../types/settings-field-errors.type';

export class InvalidSettingsError extends Error {
  constructor(
    readonly fieldErrors: SettingsFieldErrors,
    message = `Invalid settings: ${Object.keys(fieldErrors).join(', ')}.`,
  ) {
    super(message);
    this.name = 'InvalidSettingsError';
  }
}
