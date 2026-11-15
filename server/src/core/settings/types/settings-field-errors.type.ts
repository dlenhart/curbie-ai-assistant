import type { HouseholdSettings } from '../interfaces/household-settings.interface';

export type SettingsFieldErrors = Readonly<Partial<Record<keyof HouseholdSettings, string>>>;
