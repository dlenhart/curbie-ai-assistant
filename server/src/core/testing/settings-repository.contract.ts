import type { SettingsRepository } from '../settings/interfaces/settings-repository.interface';

export function describeSettingsRepositoryContract(name: string, createRepository: () => SettingsRepository): void {
  describe(`${name} (SettingsRepository contract)`, () => {
    let repository: SettingsRepository;

    beforeEach(() => {
      repository = createRepository();
    });

    it('returns no values when nothing is saved', () => {
      expect(repository.loadAll()).toEqual({});
    });

    it('returns the saved values', () => {
      repository.saveAll({ units: 'metric', timeZone: 'America/Chicago' }, '2026-11-15T12:00:00.000Z');
      expect(repository.loadAll()).toEqual({ units: 'metric', timeZone: 'America/Chicago' });
    });

    it('overwrites only the keys a later save names', () => {
      repository.saveAll({ units: 'metric', timeZone: 'America/Chicago' }, '2026-11-15T12:00:00.000Z');
      repository.saveAll({ units: 'imperial' }, '2026-11-15T13:00:00.000Z');
      expect(repository.loadAll()).toEqual({ units: 'imperial', timeZone: 'America/Chicago' });
    });
  });
}
