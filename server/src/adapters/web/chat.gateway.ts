import { Inject, Logger } from '@nestjs/common';
import { MessageBody, SubscribeMessage, WebSocketGateway, type WsResponse } from '@nestjs/websockets';
import { GENERATION_QUEUE, ORCHESTRATOR, OWNER_USER_ID } from '../../constants';
import type { ConversationOrchestrator } from '../../core/conversation/conversation.orchestrator';
import type { AssistantReply } from '../../core/conversation/interfaces/assistant-reply.interface';
import { ModelUnavailableError } from '../../core/model/errors/model-unavailable.error';
import type { SerialTaskQueue } from '../../core/shared/serial-task.queue';
import type { ChatErrorPayload } from './interfaces/chat-error-payload.interface';
import { parseUserMessagePayload } from './user-message-payload.parser';

@WebSocketGateway({ path: '/ws' })
export class ChatGateway {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @Inject(ORCHESTRATOR) private readonly orchestrator: ConversationOrchestrator,
    @Inject(GENERATION_QUEUE) private readonly generationQueue: SerialTaskQueue,
  ) {}

  @SubscribeMessage('user_message')
  async handleUserMessage(@MessageBody() payload: unknown): Promise<WsResponse<AssistantReply | ChatErrorPayload>> {
    const parsed = parseUserMessagePayload(payload);
    if (!parsed.isValid) return { event: 'chat_error', data: { message: parsed.reason } };

    try {
      const reply = await this.generationQueue.run(() =>
        this.orchestrator.handleUserMessage({
          userId: OWNER_USER_ID,
          conversationId: parsed.conversationId,
          text: parsed.text,
        }),
      );
      return { event: 'assistant_reply', data: reply };
    } catch (error) {
      if (error instanceof ModelUnavailableError) {
        this.logger.warn(error.message);
        return { event: 'chat_error', data: { message: `The model isn't responding: ${error.message}` } };
      }
      this.logger.error(error);
      return { event: 'chat_error', data: { message: `Something went wrong inside Curbie: ${(error as Error).message}` } };
    }
  }
}
