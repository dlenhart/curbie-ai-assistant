import type { Citation } from '../../answers/interfaces/citation.interface';
import type { AnswerCategory } from '../../answers/types/answer-category.type';
import type { StoredMessageRole } from '../types/stored-message-role.type';

export interface StoredMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly role: StoredMessageRole;
  readonly content: string;
  readonly category: AnswerCategory | 'error' | null;
  readonly citations: readonly Citation[];
  readonly createdAt: string;
}
