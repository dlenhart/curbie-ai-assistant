import type { Citation } from '../../answers/interfaces/citation.interface';
import type { ReplyCategory } from '../types/reply-category.type';

export interface AssistantReply {
  readonly conversationId: string;
  readonly category: ReplyCategory;
  readonly text: string;
  readonly citations: readonly Citation[];
}
