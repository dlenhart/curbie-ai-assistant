import type { HouseholdSettings } from '../../settings/interfaces/household-settings.interface';

export interface ToolExecutionContext {
  readonly settings: HouseholdSettings;
}
