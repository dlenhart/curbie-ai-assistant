import Database from 'better-sqlite3';
import { describeTranscriptRepositoryContract } from '../../core/testing/transcript-repository.contract';
import { runMigrations } from './schema.migrator';
import { SqliteTranscriptRepository } from './sqlite-transcript.repository';

describeTranscriptRepositoryContract('SqliteTranscriptRepository', () => {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  runMigrations(database);
  return new SqliteTranscriptRepository(database);
});
