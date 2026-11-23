import { Controller, Get, Inject, NotFoundException, Param, Render, Res } from '@nestjs/common';
import { RECIPE_FILE_STORE, RECIPE_LIBRARY } from '../../constants';
import type { RecipeFileStore } from '../../core/recipes/interfaces/recipe-file-store.interface';
import type { RecipeLibraryService } from '../../core/recipes/recipe-library.service';
import type { FileSendingResponse } from './interfaces/file-sending-response.interface';
import type { RecipeViewPageModel } from './interfaces/recipe-view-page-model.interface';
import { buildRecipeViewPageModel } from './recipe-page-model.builder';
import { resolveStoredRecipe } from './stored-recipe.resolver';

@Controller()
export class RecipeViewController {
  constructor(
    @Inject(RECIPE_LIBRARY) private readonly library: RecipeLibraryService,
    @Inject(RECIPE_FILE_STORE) private readonly files: RecipeFileStore,
  ) {}

  @Get('/recipes/:id')
  @Render('recipe')
  showRecipe(@Param('id') requestedId: unknown): RecipeViewPageModel {
    const recipe = resolveStoredRecipe(this.library, requestedId);
    if (recipe.approvedAt === null || recipe.approvedMarkdown === null) throw new NotFoundException();
    return buildRecipeViewPageModel(recipe);
  }

  @Get('/recipes/:id/pages/:pageNumber')
  showPageImage(
    @Param('id') requestedId: unknown,
    @Param('pageNumber') requestedPageNumber: unknown,
    @Res() response: FileSendingResponse,
  ): void {
    const recipe = resolveStoredRecipe(this.library, requestedId);
    const page = recipe.pages.find((candidate) => String(candidate.pageNumber) === requestedPageNumber);
    if (page === undefined) throw new NotFoundException();
    response.sendFile(
      this.files.absoluteDisplayPath(page),
      { headers: { 'content-type': 'image/jpeg' }, dotfiles: 'allow' },
      (error) => {
        if (error === undefined || response.headersSent) return;
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end();
      },
    );
  }
}
