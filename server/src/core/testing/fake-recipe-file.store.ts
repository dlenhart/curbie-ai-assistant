import type { InboxPhoto } from '../recipes/interfaces/inbox-photo.interface';
import type { RecipeFileStore } from '../recipes/interfaces/recipe-file-store.interface';
import type { RecipePage } from '../recipes/interfaces/recipe-page.interface';

export class FakeRecipeFileStore implements RecipeFileStore {
  readonly committedRecipeIds: string[] = [];
  readonly abandonedRecipeIds: string[] = [];
  readonly discardedRecipeIds: string[] = [];

  constructor(private readonly sha256ByInboxFileName: ReadonlyMap<string, string>) {}

  listInboxFileNames(): readonly string[] {
    return [...this.sha256ByInboxFileName.keys()];
  }

  async readInboxPhoto(fileName: string): Promise<InboxPhoto> {
    const sha256 = this.sha256ByInboxFileName.get(fileName);
    if (sha256 === undefined) throw new Error(`No inbox file ${fileName}.`);
    return { fileName, absolutePath: `/inbox/${fileName}`, sha256 };
  }

  workDisplayPath(recipeId: string, pageNumber: number): string {
    return `/work/${recipeId}/page-${pageNumber}.display.jpg`;
  }

  commitPages(recipeId: string, photos: readonly InboxPhoto[]): readonly RecipePage[] {
    this.committedRecipeIds.push(recipeId);
    return photos.map((photo, index) => ({
      pageNumber: index + 1,
      originalPath: `originals/recipes/${recipeId}/${photo.fileName}`,
      displayPath: `originals/recipes/${recipeId}/page-${index + 1}.display.jpg`,
      sha256: photo.sha256,
    }));
  }

  abandonWork(recipeId: string): void {
    this.abandonedRecipeIds.push(recipeId);
  }

  moveRecipeToDiscarded(recipeId: string): void {
    this.discardedRecipeIds.push(recipeId);
  }

  absoluteDisplayPath(page: RecipePage): string {
    return page.displayPath;
  }
}
