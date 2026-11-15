import { Controller, Get, Inject, Render } from '@nestjs/common';
import { ID_GENERATOR } from '../../constants';
import type { IdGenerator } from '../../core/shared/interfaces/id-generator.interface';
import type { NavigationLink } from './interfaces/navigation-link.interface';
import { buildNavigation } from './navigation.builder';

@Controller()
export class ChatPageController {
  constructor(@Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator) {}

  @Get('/')
  @Render('chat')
  showChat(): { pageTitle: string; navigation: readonly NavigationLink[]; scriptPath: string; conversationId: string } {
    return {
      pageTitle: 'Curbie',
      navigation: buildNavigation('chat'),
      scriptPath: '/static/chat.js',
      conversationId: this.idGenerator.next('conv'),
    };
  }
}
