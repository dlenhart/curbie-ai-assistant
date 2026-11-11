import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../constants';
import { MigrationError } from './errors/migration.error';
import type { Migration } from './interfaces/migration.interface';
import { runMigrations, selectPendingMigrations } from './schema.migrator';

describe('selectPendingMigrations', () => {
  const migrations: Migration[] = [
    { version: 1, name: 'one', sql: '' },
    { version: 2, name: 'two', sql: '' },
  ];

  it('returns migrations not yet applied, in order', () => {
    expect(selectPendingMigrations(migrations, new Set([1])).map((m) => m.version)).toEqual([2]);
  });

  it('refuses migration lists with gaps or misordering', () => {
    expect(() => selectPendingMigrations([migrations[1]], new Set())).toThrow(MigrationError);
  });

  it('refuses to run against a database that has migrations this code does not know', () => {
    expect(() => selectPendingMigrations(migrations, new Set([1, 2, 3]))).toThrow(/does not know about/);
  });
});

describe('runMigrations', () => {
  it('applies every migration to a fresh database and seeds the owner user', () => {
    const database = new Database(':memory:');
    expect(runMigrations(database)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(database.prepare('SELECT id FROM users').all()).toEqual([{ id: 'owner' }]);
  });

  it('is a no-op the second time', () => {
    const database = new Database(':memory:');
    runMigrations(database);
    expect(runMigrations(database)).toEqual([]);
  });

  it('rolls back a failing migration completely and fails loudly', () => {
    const database = new Database(':memory:');
    const broken: Migration[] = [
      { version: 1, name: 'good', sql: 'CREATE TABLE good (id INTEGER);' },
      { version: 2, name: 'bad', sql: 'CREATE TABLE half (id INTEGER); THIS IS NOT SQL;' },
    ];
    expect(() => runMigrations(database, broken)).toThrow(/Migration 2 \(bad\) failed/);
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    expect(tables).toEqual([{ name: 'good' }, { name: 'schema_migrations' }]);
    expect(database.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
  });
});
