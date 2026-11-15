import { UNIT_LABELS, UNITS } from '../../constants';
import type { SelectOption } from './interfaces/select-option.interface';
import type { SettingsPageInput } from './interfaces/settings-page-input.interface';
import type { SettingsPageModel } from './interfaces/settings-page-model.interface';
import { buildNavigation } from './navigation.builder';

export function buildSettingsPageModel(input: SettingsPageInput): SettingsPageModel {
  const { settings } = input;
  const modelNames = [...new Set([...(input.installedModelNames ?? []), settings.modelName])].sort();
  return {
    pageTitle: 'Curbie · Settings',
    navigation: buildNavigation('manage'),
    modelOptions: modelNames.map((name) => toOption(name, name, settings.modelName)),
    isModelListUnavailable: input.installedModelNames === null,
    timeZoneOptions: input.timeZones.map((zone) => toOption(zone, zone, settings.timeZone)),
    unitOptions: UNITS.map((units) => toOption(units, UNIT_LABELS[units], settings.units)),
    fieldErrors: input.fieldErrors,
    isSaved: input.isSaved,
  };
}

function toOption(value: string, label: string, selectedValue: string): SelectOption {
  return { value, label, isSelected: value === selectedValue };
}
