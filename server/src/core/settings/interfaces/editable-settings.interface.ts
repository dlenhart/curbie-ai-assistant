import type { SettingsFieldErrors } from '../types/settings-field-errors.type';
import type { HouseholdSettings } from './household-settings.interface';

export interface EditableSettings {
  readonly settings: HouseholdSettings;
  readonly fieldErrors: SettingsFieldErrors;
}
