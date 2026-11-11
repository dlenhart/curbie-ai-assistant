import type { AnswerCategory } from '../../../core/answers/types/answer-category.type';
import type { StoredMessageRole } from '../../../core/conversation/types/stored-message-role.type';

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: StoredMessageRole;
  content: string;
  category: AnswerCategory | 'error' | null;
  citations: string;
  created_at: string;
}
