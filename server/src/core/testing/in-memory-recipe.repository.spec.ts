import { InMemoryRecipeRepository } from './in-memory-recipe.repository';
import { describeRecipeRepositoryContract } from './recipe-repository.contract';

describeRecipeRepositoryContract('InMemoryRecipeRepository', () => new InMemoryRecipeRepository());
