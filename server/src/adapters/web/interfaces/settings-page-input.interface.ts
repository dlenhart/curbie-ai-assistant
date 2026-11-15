import type { HouseholdSettings } from '../../../core/settings/interfaces/household-settings.interface';
import type { SettingsFieldErrors } from '../../../core/settings/types/settings-field-errors.type';

export interface SettingsPageInput {
  readonly settings: HouseholdSettings;
  readonly installedModelNames: readonly string[] | null;
  readonly timeZones: readonly string[];
  readonly fieldErrors: SettingsFieldErrors;
  readonly isSaved: boolean;
}
