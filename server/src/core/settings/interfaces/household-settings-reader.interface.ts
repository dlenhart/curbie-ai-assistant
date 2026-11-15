import type { HouseholdSettings } from './household-settings.interface';

export interface HouseholdSettingsReader {
  current(): HouseholdSettings;
}
