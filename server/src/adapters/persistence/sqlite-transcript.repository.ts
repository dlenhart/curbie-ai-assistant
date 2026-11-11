import type Database from 'better-sqlite3';
import type { Citation } from '../../core/answers/interfaces/citation.interface';
import { ConversationOwnershipError } from '../../core/conversation/errors/conversation-ownership.error';
import { UnknownConversationError } from '../../core/conversation/errors/unknown-conversation.error';
import type { StoredMessage } from '../../core/conversation/interfaces/stored-message.interface';
import type { TranscriptRepository } from '../../core/conversation/interfaces/transcript-repository.interface';
import type { MessageRow } from './interfaces/message-row.interface';

export class SqliteTranscriptRepository implements TranscriptRepository {
  constructor(private readonly database: Database.Database) {}

  ensureConversation(conversationId: string, userId: string, createdAt: string): void {
    const ownerUserId = this.findOwner(conversationId);
    if (ownerUserId === undefined) {
      this.database
        .prepare('INSERT INTO conversations (id, user_id, created_at) VALUES (?, ?, ?)')
        .run(conversationId, userId, createdAt);
      return;
    }
    if (ownerUserId !== userId) throw new ConversationOwnershipError(conversationId);
  }

  appendMessage(message: StoredMessage): void {
    if (this.findOwner(message.conversationId) === undefined) {
      throw new UnknownConversationError(message.conversationId);
    }
    this.database
      .prepare(
        'INSERT INTO messages (id, conversation_id, role, content, category, citations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        message.id,
        message.conversationId,
        message.role,
        message.content,
        message.category,
        JSON.stringify(message.citations),
        message.createdAt,
      );
  }

  recentMessages(conversationId: string, limit: number): readonly StoredMessage[] {
    if (limit === 0) return [];
    const rows = this.database
      .prepare(
        'SELECT id, conversation_id, role, content, category, citations, created_at FROM messages WHERE conversation_id = ? ORDER BY rowid DESC LIMIT ?',
      )
      .all(conversationId, limit) as MessageRow[];
    return rows.reverse().map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      category: row.category,
      citations: JSON.parse(row.citations) as Citation[],
      createdAt: row.created_at,
    }));
  }

  private findOwner(conversationId: string): string | undefined {
    const row = this.database.prepare('SELECT user_id FROM conversations WHERE id = ?').get(conversationId) as
      | { user_id: string }
      | undefined;
    return row?.user_id;
  }
}
