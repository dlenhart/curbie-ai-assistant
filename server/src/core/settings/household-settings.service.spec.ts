import { SETTINGS_FIELD_ERRORS } from '../../constants';
import { ModelUnavailableError } from '../model/errors/model-unavailable.error';
import { FakeModelCatalog } from '../testing/fake-model.catalog';
import { FixedClock } from '../testing/fixed.clock';
import { InMemorySettingsRepository } from '../testing/in-memory-settings.repository';
import { InvalidSettingsError } from './errors/invalid-settings.error';
import { HouseholdSettingsService } from './household-settings.service';
import type { HouseholdSettings } from './interfaces/household-settings.interface';

const DEFAULTS: HouseholdSettings = { modelName: 'qwen3:4b-instruct', timeZone: 'America/New_York', units: 'imperial' };
const ZONES = new Set(['America/New_York', 'UTC', 'America/Chicago']);
const VALID_SUBMISSION = { modelName: 'qwen3:8b', timeZone: 'America/Chicago', units: 'metric' };

describe('HouseholdSettingsService', () => {
  let repository: InMemorySettingsRepository;
  let catalog: FakeModelCatalog;

  function createService(modelCatalog: FakeModelCatalog = catalog): HouseholdSettingsService {
    return new HouseholdSettingsService({
      repository,
      modelCatalog,
      clock: new FixedClock(new Date('2026-11-15T12:00:00.000Z')),
      defaults: DEFAULTS,
      supportedTimeZones: ZONES,
    });
  }

  async function captureFieldErrors(promise: Promise<unknown>): Promise<Record<string, string>> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof InvalidSettingsError) return { ...error.fieldErrors };
      throw error;
    }
    throw new Error('Expected InvalidSettingsError.');
  }

  beforeEach(() => {
    repository = new InMemorySettingsRepository();
    catalog = new FakeModelCatalog(['qwen3:4b-instruct', 'qwen3:8b']);
  });

  it('current() returns the defaults when nothing is stored', () => {
    expect(createService().current()).toEqual(DEFAULTS);
  });

  it('current() overlays stored values on the defaults', () => {
    repository.saveAll({ units: 'metric' }, '2026-11-15T11:00:00.000Z');
    expect(createService().current()).toEqual({ ...DEFAULTS, units: 'metric' });
  });

  it('current() throws InvalidSettingsError when a stored time zone is not supported', () => {
    repository.saveAll({ timeZone: 'Mars/Olympus' }, '2026-11-15T11:00:00.000Z');
    expect(() => createService().current()).toThrow(InvalidSettingsError);
  });

  it('update() saves all three fields with the clock timestamp and returns the new settings', async () => {
    const saved = await createService().update(VALID_SUBMISSION);
    expect(saved).toEqual(VALID_SUBMISSION);
    expect(repository.loadAll()).toEqual(VALID_SUBMISSION);
    expect(repository.lastUpdatedAt).toBe('2026-11-15T12:00:00.000Z');
  });

  it('update() checks the catalog only when the model changes', async () => {
    const unreachable = new FakeModelCatalog(new ModelUnavailableError('down'));
    const saved = await createService(unreachable).update({ ...VALID_SUBMISSION, modelName: 'qwen3:4b-instruct' });
    expect(saved.timeZone).toBe('America/Chicago');
    expect(unreachable.callCount).toBe(0);
  });

  it('update() rejects a model that is not installed and saves nothing', async () => {
    const fieldErrors = await captureFieldErrors(createService().update({ ...VALID_SUBMISSION, modelName: 'llama9:1t' }));
    expect(fieldErrors).toEqual({ modelName: SETTINGS_FIELD_ERRORS.modelNotInstalled });
    expect(repository.loadAll()).toEqual({});
  });

  it('update() reports an unreachable catalog when the model changes', async () => {
    const unreachable = new FakeModelCatalog(new ModelUnavailableError('down'));
    const fieldErrors = await captureFieldErrors(createService(unreachable).update(VALID_SUBMISSION));
    expect(fieldErrors).toEqual({ modelName: SETTINGS_FIELD_ERRORS.modelCatalogUnavailable });
  });

  it('update() collects every field error at once', async () => {
    const fieldErrors = await captureFieldErrors(
      createService().update({ modelName: '', timeZone: 'Mars/Olympus', units: 'kelvin' }),
    );
    expect(fieldErrors).toEqual({
      modelName: SETTINGS_FIELD_ERRORS.modelRequired,
      timeZone: SETTINGS_FIELD_ERRORS.timeZoneInvalid,
      units: SETTINGS_FIELD_ERRORS.unitsInvalid,
    });
  });

  it('update() rejects non-string values', async () => {
    const fieldErrors = await captureFieldErrors(createService().update({ ...VALID_SUBMISSION, units: ['metric'] }));
    expect(fieldErrors).toEqual({ units: SETTINGS_FIELD_ERRORS.unitsInvalid });
  });

  it('update() ignores unknown keys', async () => {
    const submission = { ...VALID_SUBMISSION, ...JSON.parse('{"layout":"x","__proto__":{"polluted":true}}') };
    await createService().update(submission);
    expect(repository.loadAll()).toEqual(VALID_SUBMISSION);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('readForEditing() replaces an invalid stored value with its default and reports it', () => {
    repository.saveAll({ timeZone: 'Mars/Olympus', units: 'metric' }, '2026-11-15T11:00:00.000Z');
    expect(createService().readForEditing()).toEqual({
      settings: { ...DEFAULTS, units: 'metric' },
      fieldErrors: { timeZone: SETTINGS_FIELD_ERRORS.timeZoneInvalid },
    });
  });

  it('update() saves over an invalid stored value', async () => {
    repository.saveAll({ timeZone: 'Mars/Olympus' }, '2026-11-15T11:00:00.000Z');
    const service = createService();
    await service.update({ ...VALID_SUBMISSION, modelName: 'qwen3:4b-instruct' });
    expect(service.current().timeZone).toBe('America/Chicago');
  });

  it('refuses to be built with invalid defaults', () => {
    expect(
      () =>
        new HouseholdSettingsService({
          repository,
          modelCatalog: catalog,
          clock: new FixedClock(new Date('2026-11-15T12:00:00.000Z')),
          defaults: { ...DEFAULTS, timeZone: 'Etc/Unknown' },
          supportedTimeZones: ZONES,
        }),
    ).toThrow(/default household settings are invalid \(timeZone\)/);
  });

  it('supportedTimeZones() returns the zones sorted', () => {
    expect(createService().supportedTimeZones()).toEqual(['America/Chicago', 'America/New_York', 'UTC']);
  });
});
