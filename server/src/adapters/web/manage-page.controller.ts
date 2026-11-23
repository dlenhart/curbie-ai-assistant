import { Controller, Get, Inject, Render } from '@nestjs/common';
import { RECIPE_LIBRARY } from '../../constants';
import type { RecipeLibraryService } from '../../core/recipes/recipe-library.service';
import type { ManagePageModel } from './interfaces/manage-page-model.interface';
import { buildNavigation } from './navigation.builder';

@Controller()
export class ManagePageController {
  constructor(@Inject(RECIPE_LIBRARY) private readonly library: RecipeLibraryService) {}

  @Get('/manage')
  @Render('manage')
  showManage(): ManagePageModel {
    const counts = this.library.counts();
    return {
      pageTitle: 'Curbie · Manage',
      navigation: buildNavigation('manage'),
      approvedRecipeCount: counts.approved,
      needsReviewRecipeCount: counts.needsReview,
    };
  }
}
