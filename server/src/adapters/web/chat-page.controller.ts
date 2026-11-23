import { Controller, Get, Inject, Render } from '@nestjs/common';
import { ID_GENERATOR, RECIPE_LIBRARY } from '../../constants';
import type { RecipeLibraryService } from '../../core/recipes/recipe-library.service';
import type { IdGenerator } from '../../core/shared/interfaces/id-generator.interface';
import type { ChatPageModel } from './interfaces/chat-page-model.interface';
import { buildNavigation } from './navigation.builder';
import { buildRecipeNotice } from './recipe-notice.builder';

@Controller()
export class ChatPageController {
  constructor(
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(RECIPE_LIBRARY) private readonly library: RecipeLibraryService,
  ) {}

  @Get('/')
  @Render('chat')
  showChat(): ChatPageModel {
    return {
      pageTitle: 'Curbie',
      navigation: buildNavigation('chat'),
      scriptPath: '/static/chat.js',
      conversationId: this.idGenerator.next('conv'),
      recipeNotice: buildRecipeNotice({
        needsReviewCount: this.library.counts().needsReview,
        scanProblemCount: this.library.latestScanReport()?.problems.length ?? 0,
      }),
    };
  }
}
