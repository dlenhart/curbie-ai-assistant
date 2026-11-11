import Database from 'better-sqlite3';
import { join } from 'node:path';
import { assertDataDirectoryUsable } from './data-directory.guard';
import { runMigrations } from './schema.migrator';

export function openDatabase(dataDirectory: string): Database.Database {
  assertDataDirectoryUsable(dataDirectory);
  const database = new Database(join(dataDirectory, 'curbie.db'));
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  runMigrations(database);
  return database;
}
