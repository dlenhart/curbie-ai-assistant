import { ConversationOwnershipError } from '../conversation/errors/conversation-ownership.error';
import { UnknownConversationError } from '../conversation/errors/unknown-conversation.error';
import type { StoredMessage } from '../conversation/interfaces/stored-message.interface';
import type { TranscriptRepository } from '../conversation/interfaces/transcript-repository.interface';

export class InMemoryTranscriptRepository implements TranscriptRepository {
  private readonly ownerByConversation = new Map<string, string>();
  private readonly messagesByConversation = new Map<string, StoredMessage[]>();

  ensureConversation(conversationId: string, userId: string): void {
    const owner = this.ownerByConversation.get(conversationId);
    if (owner === undefined) {
      this.ownerByConversation.set(conversationId, userId);
      this.messagesByConversation.set(conversationId, []);
      return;
    }
    if (owner !== userId) throw new ConversationOwnershipError(conversationId);
  }

  appendMessage(message: StoredMessage): void {
    const messages = this.messagesByConversation.get(message.conversationId);
    if (messages === undefined) throw new UnknownConversationError(message.conversationId);
    messages.push(message);
  }

  recentMessages(conversationId: string, limit: number): readonly StoredMessage[] {
    if (limit === 0) return [];
    const messages = this.messagesByConversation.get(conversationId) ?? [];
    return messages.slice(-limit);
  }
}
