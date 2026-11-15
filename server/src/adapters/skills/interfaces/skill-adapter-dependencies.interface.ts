import type { HouseholdSettingsReader } from '../../../core/settings/interfaces/household-settings-reader.interface';
import type { Clock } from '../../../core/shared/interfaces/clock.interface';

export interface SkillAdapterDependencies {
  readonly clock: Clock;
  readonly settings: HouseholdSettingsReader;
}
