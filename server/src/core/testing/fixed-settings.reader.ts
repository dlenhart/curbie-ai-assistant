import type { HouseholdSettingsReader } from '../settings/interfaces/household-settings-reader.interface';
import type { HouseholdSettings } from '../settings/interfaces/household-settings.interface';

export class FixedSettingsReader implements HouseholdSettingsReader {
  readCount = 0;

  constructor(private settings: HouseholdSettings) {}

  current(): HouseholdSettings {
    this.readCount++;
    return this.settings;
  }

  replace(next: HouseholdSettings): void {
    this.settings = next;
  }
}
