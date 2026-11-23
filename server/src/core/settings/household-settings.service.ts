import { SETTINGS_FIELD_ERRORS, UNITS } from '../../constants';
import { ModelUnavailableError } from '../model/errors/model-unavailable.error';
import { InvalidSettingsError } from './errors/invalid-settings.error';
import type { EditableSettings } from './interfaces/editable-settings.interface';
import type { HouseholdSettingsReader } from './interfaces/household-settings-reader.interface';
import type { HouseholdSettingsServiceDependencies } from './interfaces/household-settings-service-dependencies.interface';
import type { HouseholdSettings } from './interfaces/household-settings.interface';
import type { ModelCheck } from './types/model-check.type';
import type { SettingsFieldErrors } from './types/settings-field-errors.type';
import type { Units } from './types/units.type';

export class HouseholdSettingsService implements HouseholdSettingsReader {
  constructor(private readonly dependencies: HouseholdSettingsServiceDependencies) {
    const defaultErrors = this.validate(dependencies.defaults);
    if (Object.keys(defaultErrors).length > 0) {
      const fields = Object.keys(defaultErrors).join(', ');
      throw new InvalidSettingsError(
        defaultErrors,
        {},
        `The default household settings are invalid (${fields}). Check the host time zone (TZ) and CURBIE_MODEL.`,
      );
    }
  }

  current(): HouseholdSettings {
    const { settings, fieldErrors } = this.readForEditing();
    if (Object.keys(fieldErrors).length > 0) throw new InvalidSettingsError(fieldErrors);
    return settings;
  }

  readForEditing(): EditableSettings {
    const stored = this.dependencies.repository.loadAll();
    const { defaults } = this.dependencies;
    const candidate = {
      modelName: stored.modelName ?? defaults.modelName,
      timeZone: stored.timeZone ?? defaults.timeZone,
      units: stored.units ?? defaults.units,
    };
    const fieldErrors = this.validate(candidate);
    const settings: HouseholdSettings = {
      modelName: fieldErrors.modelName === undefined ? candidate.modelName : defaults.modelName,
      timeZone: fieldErrors.timeZone === undefined ? candidate.timeZone : defaults.timeZone,
      units: fieldErrors.units === undefined ? (candidate.units as Units) : defaults.units,
    };
    return { settings, fieldErrors };
  }

  async update(submission: Readonly<Record<string, unknown>>): Promise<HouseholdSettings> {
    const modelCheck = await this.checkModel(submission.modelName);
    const matchedTimeZone = this.matchTimeZone(submission.timeZone);
    const matchedUnits = UNITS.find((candidate) => candidate === submission.units);

    if (!modelCheck.isAccepted || matchedTimeZone === undefined || matchedUnits === undefined) {
      throw new InvalidSettingsError(
        {
          ...(modelCheck.isAccepted ? {} : { modelName: modelCheck.error }),
          ...(matchedTimeZone === undefined ? { timeZone: SETTINGS_FIELD_ERRORS.timeZoneInvalid } : {}),
          ...(matchedUnits === undefined ? { units: SETTINGS_FIELD_ERRORS.unitsInvalid } : {}),
        },
        {
          ...(modelCheck.isAccepted ? { modelName: modelCheck.modelName } : {}),
          ...(matchedTimeZone === undefined ? {} : { timeZone: matchedTimeZone }),
          ...(matchedUnits === undefined ? {} : { units: matchedUnits }),
        },
      );
    }

    const settings: HouseholdSettings = { modelName: modelCheck.modelName, timeZone: matchedTimeZone, units: matchedUnits };
    this.dependencies.repository.saveAll({ ...settings }, this.dependencies.clock.now().toISOString());
    return settings;
  }

  supportedTimeZones(): readonly string[] {
    return [...this.dependencies.supportedTimeZones].sort();
  }

  private async checkModel(submitted: unknown): Promise<ModelCheck> {
    if (typeof submitted !== 'string' || submitted.trim() === '') {
      return { isAccepted: false, error: SETTINGS_FIELD_ERRORS.modelRequired };
    }
    const modelName = submitted.trim();
    const currentModelName = this.readForEditing().settings.modelName;
    if (modelName === currentModelName) return { isAccepted: true, modelName: currentModelName };

    let installedModelNames: readonly string[];
    try {
      installedModelNames = await this.dependencies.modelCatalog.listInstalledModelNames();
    } catch (error) {
      if (error instanceof ModelUnavailableError) {
        return { isAccepted: false, error: SETTINGS_FIELD_ERRORS.modelCatalogUnavailable };
      }
      throw error;
    }
    const installedName = installedModelNames.find((name) => name === modelName);
    if (installedName === undefined) return { isAccepted: false, error: SETTINGS_FIELD_ERRORS.modelNotInstalled };
    return { isAccepted: true, modelName: installedName };
  }

  private matchTimeZone(submitted: unknown): string | undefined {
    return [...this.dependencies.supportedTimeZones].find((timeZone) => timeZone === submitted);
  }

  private validate(candidate: { modelName: string; timeZone: string; units: string }): SettingsFieldErrors {
    const fieldErrors: { -readonly [Field in keyof SettingsFieldErrors]: string } = {};
    if (candidate.modelName.trim() === '') fieldErrors.modelName = SETTINGS_FIELD_ERRORS.modelRequired;
    if (!this.isSupportedTimeZone(candidate.timeZone)) fieldErrors.timeZone = SETTINGS_FIELD_ERRORS.timeZoneInvalid;
    if (!isUnits(candidate.units)) fieldErrors.units = SETTINGS_FIELD_ERRORS.unitsInvalid;
    return fieldErrors;
  }

  private isSupportedTimeZone(timeZone: string): boolean {
    return this.dependencies.supportedTimeZones.has(timeZone);
  }
}

function isUnits(value: unknown): value is Units {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}
