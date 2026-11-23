import Database from 'better-sqlite3';
import { describeRecipeRepositoryContract, newRecipe, searchDocument } from '../../core/testing/recipe-repository.contract';
import { runMigrations } from './schema.migrator';
import { SqliteRecipeRepository } from './sqlite-recipe.repository';

function createDatabase(): Database.Database {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  runMigrations(database);
  return database;
}

describeRecipeRepositoryContract('SqliteRecipeRepository', () => new SqliteRecipeRepository(createDatabase()));

describe('SqliteRecipeRepository search', () => {
  const approvedAt = '2026-11-23T12:00:00.000Z';
  let repository: SqliteRecipeRepository;

  beforeEach(() => {
    repository = new SqliteRecipeRepository(createDatabase());
    repository.create(newRecipe('rec_cake', 'Texas Sheet Cake'));
    repository.create(newRecipe('rec_pie', 'Apple Pie'));
    repository.approve(
      'rec_cake',
      '# Texas Sheet Cake',
      'Texas Sheet Cake',
      searchDocument('Texas Sheet Cake', '2 cups flour\n1 cup sugar'),
      approvedAt,
    );
    repository.approve('rec_pie', '# Apple Pie', 'Apple Pie', searchDocument('Apple Pie', '6 apples\n1 cup sugar'), approvedAt);
  });

  it('search ranks "our Texas sheet cake recipe" to the sheet cake', () => {
    expect(repository.search('our Texas sheet cake recipe')[0].id).toBe('rec_cake');
  });

  it('search treats FTS syntax in the query ("cake" OR NEAR( ) as plain words', () => {
    expect(() => repository.search('"cake" OR NEAR( ')).not.toThrow();
    expect(repository.search('"cake" OR NEAR( ').map((hit) => hit.id)).toContain('rec_cake');
  });
});
