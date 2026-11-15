import type { ModelCatalogPort } from '../../model/interfaces/model-catalog-port.interface';
import type { Clock } from '../../shared/interfaces/clock.interface';
import type { HouseholdSettings } from './household-settings.interface';
import type { SettingsRepository } from './settings-repository.interface';

export interface HouseholdSettingsServiceDependencies {
  readonly repository: SettingsRepository;
  readonly modelCatalog: ModelCatalogPort;
  readonly clock: Clock;
  readonly defaults: HouseholdSettings;
  readonly supportedTimeZones: ReadonlySet<string>;
}
