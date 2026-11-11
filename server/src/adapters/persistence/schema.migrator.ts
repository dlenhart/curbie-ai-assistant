import type Database from 'better-sqlite3';
import { MIGRATIONS } from '../../constants';
import { MigrationError } from './errors/migration.error';
import type { Migration } from './interfaces/migration.interface';

export function selectPendingMigrations(
  migrations: readonly Migration[],
  appliedVersions: ReadonlySet<number>,
): Migration[] {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new MigrationError(
        `Migrations must be numbered 1..n in order; found version ${migration.version} at position ${index + 1}.`,
      );
    }
  });
  for (const appliedVersion of appliedVersions) {
    if (!migrations.some((migration) => migration.version === appliedVersion)) {
      throw new MigrationError(
        `The database has migration ${appliedVersion} applied, which this code does not know about. Refusing to run against a newer database.`,
      );
    }
  }
  return migrations.filter((migration) => !appliedVersions.has(migration.version));
}

export function runMigrations(database: Database.Database, migrations: readonly Migration[] = MIGRATIONS): number[] {
  database.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
  );
  const appliedRows = database.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>;
  const pending = selectPendingMigrations(migrations, new Set(appliedRows.map((row) => row.version)));

  const recordMigration = database.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
  for (const migration of pending) {
    const applyMigration = database.transaction(() => {
      database.exec(migration.sql);
      recordMigration.run(migration.version, migration.name, new Date().toISOString());
    });
    try {
      applyMigration();
    } catch (error) {
      throw new MigrationError(`Migration ${migration.version} (${migration.name}) failed: ${(error as Error).message}`);
    }
  }
  return pending.map((migration) => migration.version);
}
