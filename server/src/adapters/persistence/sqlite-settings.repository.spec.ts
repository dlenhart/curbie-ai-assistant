import Database from 'better-sqlite3';
import { describeSettingsRepositoryContract } from '../../core/testing/settings-repository.contract';
import { runMigrations } from './schema.migrator';
import { SqliteSettingsRepository } from './sqlite-settings.repository';

describeSettingsRepositoryContract('SqliteSettingsRepository', () => {
  const database = new Database(':memory:');
  runMigrations(database);
  return new SqliteSettingsRepository(database);
});
