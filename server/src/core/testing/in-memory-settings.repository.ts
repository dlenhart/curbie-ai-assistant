import type { SettingsRepository } from '../settings/interfaces/settings-repository.interface';

export class InMemorySettingsRepository implements SettingsRepository {
  lastUpdatedAt: string | undefined;
  private readonly values = new Map<string, string>();

  loadAll(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.values);
  }

  saveAll(values: Readonly<Record<string, string>>, updatedAt: string): void {
    for (const [key, value] of Object.entries(values)) this.values.set(key, value);
    this.lastUpdatedAt = updatedAt;
  }
}
