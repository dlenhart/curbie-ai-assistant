export interface SettingsRepository {
  loadAll(): Readonly<Record<string, string>>;
  saveAll(values: Readonly<Record<string, string>>, updatedAt: string): void;
}
