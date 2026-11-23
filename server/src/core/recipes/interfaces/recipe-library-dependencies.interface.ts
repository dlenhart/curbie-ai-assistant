import type { Clock } from '../../shared/interfaces/clock.interface';
import type { RecipeFileStore } from './recipe-file-store.interface';
import type { RecipeRepository } from './recipe-repository.interface';

export interface RecipeLibraryDependencies {
  readonly repository: RecipeRepository;
  readonly files: RecipeFileStore;
  readonly clock: Clock;
}
