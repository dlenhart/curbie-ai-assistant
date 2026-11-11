import type { StoredMessage } from './stored-message.interface';

export interface TranscriptRepository {
  ensureConversation(conversationId: string, userId: string, createdAt: string): void;
  appendMessage(message: StoredMessage): void;
  recentMessages(conversationId: string, limit: number): readonly StoredMessage[];
}
