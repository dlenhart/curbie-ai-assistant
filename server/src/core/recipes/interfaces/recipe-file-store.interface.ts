import { InboxPhoto } from './inbox-photo.interface';
import { RecipePage } from './recipe-page.interface';

export interface RecipeFileStore {
  listInboxFileNames(): readonly string[];
  readInboxPhoto(fileName: string): Promise<InboxPhoto>;
  workDisplayPath(recipeId: string, pageNumber: number): string;
  commitPages(recipeId: string, photos: readonly InboxPhoto[]): readonly RecipePage[];
  abandonWork(recipeId: string): void;
  moveRecipeToDiscarded(recipeId: string, pages: readonly RecipePage[]): void;
  absoluteDisplayPath(page: RecipePage): string;
}
