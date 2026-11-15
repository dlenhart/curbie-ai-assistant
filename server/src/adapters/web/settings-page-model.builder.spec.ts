import type { SettingsPageInput } from './interfaces/settings-page-input.interface';
import { buildSettingsPageModel } from './settings-page-model.builder';

const INPUT: SettingsPageInput = {
  settings: { modelName: 'qwen3:4b-instruct', timeZone: 'America/Chicago', units: 'metric' },
  installedModelNames: ['qwen3:8b', 'qwen3:4b-instruct', 'qwen3:4b'],
  timeZones: ['America/Chicago', 'America/New_York'],
  fieldErrors: {},
  isSaved: false,
};

describe('buildSettingsPageModel', () => {
  it('lists installed models sorted with the current one selected', () => {
    expect(buildSettingsPageModel(INPUT).modelOptions).toEqual([
      { value: 'qwen3:4b', label: 'qwen3:4b', isSelected: false },
      { value: 'qwen3:4b-instruct', label: 'qwen3:4b-instruct', isSelected: true },
      { value: 'qwen3:8b', label: 'qwen3:8b', isSelected: false },
    ]);
  });

  it("keeps the current model in the list when Ollama doesn't report it", () => {
    const model = buildSettingsPageModel({ ...INPUT, installedModelNames: ['qwen3:8b'] });
    expect(model.modelOptions.map((option) => [option.value, option.isSelected])).toEqual([
      ['qwen3:4b-instruct', true],
      ['qwen3:8b', false],
    ]);
    expect(model.isModelListUnavailable).toBe(false);
  });

  it('lists only the current model and flags the list as unavailable when Ollama is unreachable', () => {
    const model = buildSettingsPageModel({ ...INPUT, installedModelNames: null });
    expect(model.modelOptions).toEqual([{ value: 'qwen3:4b-instruct', label: 'qwen3:4b-instruct', isSelected: true }]);
    expect(model.isModelListUnavailable).toBe(true);
  });

  it('selects the current time zone and units', () => {
    const model = buildSettingsPageModel(INPUT);
    expect(model.timeZoneOptions).toEqual([
      { value: 'America/Chicago', label: 'America/Chicago', isSelected: true },
      { value: 'America/New_York', label: 'America/New_York', isSelected: false },
    ]);
    expect(model.unitOptions).toEqual([
      { value: 'imperial', label: 'Imperial (°F, mi)', isSelected: false },
      { value: 'metric', label: 'Metric (°C, km)', isSelected: true },
    ]);
  });

  it('passes field errors, the saved flag, the title, and the Manage navigation through', () => {
    const model = buildSettingsPageModel({ ...INPUT, fieldErrors: { units: 'Choose imperial or metric.' }, isSaved: true });
    expect(model.fieldErrors).toEqual({ units: 'Choose imperial or metric.' });
    expect(model.isSaved).toBe(true);
    expect(model.pageTitle).toBe('Curbie · Settings');
    expect(model.navigation.find((link) => link.isActive)?.label).toBe('MANAGE');
  });
});
