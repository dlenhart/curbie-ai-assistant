import type { Units } from '../types/units.type';

export interface HouseholdSettings {
  readonly modelName: string;
  readonly timeZone: string;
  readonly units: Units;
}
