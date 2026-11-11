import { Controller, Get, Inject, Render } from '@nestjs/common';
import { ID_GENERATOR } from '../../constants';
import type { IdGenerator } from '../../core/shared/interfaces/id-generator.interface';

@Controller()
export class ChatPageController {
  constructor(@Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator) {}

  @Get('/')
  @Render('chat')
  showChat(): { conversationId: string } {
    return { conversationId: this.idGenerator.next('conv') };
  }
}
