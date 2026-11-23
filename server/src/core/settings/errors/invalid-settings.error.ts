import type { HouseholdSettings } from '../interfaces/household-settings.interface';
import type { SettingsFieldErrors } from '../types/settings-field-errors.type';

export class InvalidSettingsError extends Error {
  constructor(
    readonly fieldErrors: SettingsFieldErrors,
    readonly acceptedValues: Partial<HouseholdSettings> = {},
    message = `Invalid settings: ${Object.keys(fieldErrors).join(', ')}.`,
  ) {
    super(message);
    this.name = 'InvalidSettingsError';
  }
}
