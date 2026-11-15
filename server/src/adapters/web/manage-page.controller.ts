import { Controller, Get, Render } from '@nestjs/common';
import type { NavigationLink } from './interfaces/navigation-link.interface';
import { buildNavigation } from './navigation.builder';

@Controller()
export class ManagePageController {
  @Get('/manage')
  @Render('manage')
  showManage(): { pageTitle: string; navigation: readonly NavigationLink[] } {
    return { pageTitle: 'Curbie · Manage', navigation: buildNavigation('manage') };
  }
}
