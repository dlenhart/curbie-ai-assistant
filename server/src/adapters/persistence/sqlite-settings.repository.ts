import type Database from 'better-sqlite3';
import type { SettingsRepository } from '../../core/settings/interfaces/settings-repository.interface';

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly database: Database.Database) {}

  loadAll(): Readonly<Record<string, string>> {
    const rows = this.database.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  saveAll(values: Readonly<Record<string, string>>, updatedAt: string): void {
    const upsert = this.database.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    );
    this.database.transaction(() => {
      for (const [key, value] of Object.entries(values)) upsert.run(key, value, updatedAt);
    })();
  }
}
