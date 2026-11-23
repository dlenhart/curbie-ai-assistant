import { Body, Controller, Get, Inject, Logger, NotFoundException, Param, Post, Query, Render, Res } from '@nestjs/common';
import { MAX_RECIPE_MARKDOWN_LENGTH, RECIPE_LIBRARY, RECIPE_PAGE_MESSAGES, RECIPE_SCANNER } from '../../constants';
import { RecipeStateError } from '../../core/recipes/errors/recipe-state.error';
import { UnknownRecipeError } from '../../core/recipes/errors/unknown-recipe.error';
import type { StoredRecipe } from '../../core/recipes/interfaces/stored-recipe.interface';
import type { RecipeInboxScanner } from '../../core/recipes/recipe-inbox.scanner';
import type { RecipeLibraryService } from '../../core/recipes/recipe-library.service';
import type { RecipeReviewPageModel } from './interfaces/recipe-review-page-model.interface';
import type { RecipesPageModel } from './interfaces/recipes-page-model.interface';
import type { RenderingResponse } from './interfaces/rendering-response.interface';
import { buildRecipeReviewPageModel, buildRecipesPageModel, findRecipePageMessage } from './recipe-page-model.builder';
import { resolveStoredRecipe } from './stored-recipe.resolver';
import type { RecipePageStatus } from './types/recipe-page-status.type';

@Controller()
export class RecipesPageController {
  constructor(
    @Inject(RECIPE_LIBRARY) private readonly library: RecipeLibraryService,
    @Inject(RECIPE_SCANNER) private readonly scanner: RecipeInboxScanner,
  ) {}

  @Get('/manage/recipes')
  @Render('recipes')
  showRecipes(@Query('status') statusFlag: unknown): RecipesPageModel {
    return buildRecipesPageModel({
      summaries: this.library.summaries(),
      scanReport: this.library.latestScanReport(),
      isScanRunning: this.scanner.isScanning(),
      statusFlag,
    });
  }

  @Post('/manage/recipes/scan')
  startScan(@Res() response: RenderingResponse): void {
    const start = this.scanner.start();
    if (start.kind === 'already_running') {
      redirect(response, listUrl('scanAlreadyRunning'));
      return;
    }
    start.completion
      .then((report) => {
        Logger.log(`Recipe scan: ${report.importedCount} imported, ${report.problems.length} problems`, 'Recipes');
      })
      .catch((error: unknown) => {
        Logger.error(`Recipe scan failed: ${error instanceof Error ? error.message : String(error)}`, 'Recipes');
      });
    redirect(response, listUrl('scanStarted'));
  }

  @Get('/manage/recipes/:id')
  @Render('recipe-review')
  showReview(@Param('id') requestedId: unknown, @Query('status') statusFlag: unknown): RecipeReviewPageModel {
    return buildRecipeReviewPageModel(resolveStoredRecipe(this.library, requestedId), findRecipePageMessage(statusFlag));
  }

  @Post('/manage/recipes/:id/save')
  saveDraft(
    @Param('id') requestedId: unknown,
    @Body() body: Readonly<Record<string, unknown>> | undefined,
    @Res() response: RenderingResponse,
  ): void {
    const recipe = resolveStoredRecipe(this.library, requestedId);
    const markdown = readMarkdown(body);
    if (markdown === null) {
      renderInvalidMarkdown(response, recipe);
      return;
    }
    this.runOrNotFound(() => this.library.saveDraft(recipe.id, markdown));
    redirect(response, reviewUrl(recipe, 'saved'));
  }

  @Post('/manage/recipes/:id/approve')
  approve(
    @Param('id') requestedId: unknown,
    @Body() body: Readonly<Record<string, unknown>> | undefined,
    @Res() response: RenderingResponse,
  ): void {
    const recipe = resolveStoredRecipe(this.library, requestedId);
    const markdown = readMarkdown(body);
    if (markdown === null) {
      renderInvalidMarkdown(response, recipe);
      return;
    }
    const outcome = this.runOrNotFound(() => this.library.approve(recipe.id, markdown));
    redirect(response, outcome.isApproved ? listUrl('approved') : reviewUrl(recipe, 'notApproved'));
  }

  @Post('/manage/recipes/:id/discard')
  discard(@Param('id') requestedId: unknown, @Res() response: RenderingResponse): void {
    const recipe = resolveStoredRecipe(this.library, requestedId);
    this.runStateChange(response, () => this.library.discard(recipe.id), listUrl(null));
  }

  @Post('/manage/recipes/:id/discard-edit')
  discardEdit(@Param('id') requestedId: unknown, @Res() response: RenderingResponse): void {
    const recipe = resolveStoredRecipe(this.library, requestedId);
    this.runStateChange(response, () => this.library.discardEdit(recipe.id), reviewUrl(recipe, null));
  }

  @Post('/manage/recipes/:id/delete')
  deleteRecipe(@Param('id') requestedId: unknown, @Res() response: RenderingResponse): void {
    const recipe = resolveStoredRecipe(this.library, requestedId);
    this.runStateChange(response, () => this.library.delete(recipe.id), listUrl(null));
  }

  private runStateChange(response: RenderingResponse, action: () => void, successLocation: string): void {
    try {
      this.runOrNotFound(action);
    } catch (error) {
      if (!(error instanceof RecipeStateError)) throw error;
      refuseWrongState(response);
      return;
    }
    redirect(response, successLocation);
  }

  private runOrNotFound<T>(action: () => T): T {
    try {
      return action();
    } catch (error) {
      if (error instanceof UnknownRecipeError) throw new NotFoundException();
      throw error;
    }
  }
}

function readMarkdown(body: Readonly<Record<string, unknown>> | undefined): string | null {
  const markdown = body?.markdown;
  if (typeof markdown !== 'string' || markdown.length > MAX_RECIPE_MARKDOWN_LENGTH) return null;
  return markdown;
}

function renderInvalidMarkdown(response: RenderingResponse, recipe: StoredRecipe): void {
  response.status(400).render('recipe-review', buildRecipeReviewPageModel(recipe, RECIPE_PAGE_MESSAGES.invalidMarkdown));
}

function refuseWrongState(response: RenderingResponse): void {
  response.writeHead(409, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(RECIPE_PAGE_MESSAGES.wrongState);
}

function redirect(response: RenderingResponse, location: string): void {
  response.writeHead(303, { location });
  response.end();
}

function listUrl(status: RecipePageStatus | null): string {
  return status === null ? '/manage/recipes' : `/manage/recipes?status=${status}`;
}

function reviewUrl(recipe: StoredRecipe, status: RecipePageStatus | null): string {
  const url = `/manage/recipes/${recipe.id}`;
  return status === null ? url : `${url}?status=${status}`;
}
