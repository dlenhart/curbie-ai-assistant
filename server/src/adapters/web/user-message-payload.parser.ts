import { CONVERSATION_ID_PATTERN, MAX_MESSAGE_LENGTH } from '../../constants';
import type { UserMessagePayloadResult } from './types/user-message-payload-result.type';

export function parseUserMessagePayload(payload: unknown): UserMessagePayloadResult {
  if (typeof payload !== 'object' || payload === null) {
    return { isValid: false, reason: 'The message must be an object.' };
  }
  const { conversationId, text } = payload as { conversationId?: unknown; text?: unknown };
  if (typeof conversationId !== 'string' || !CONVERSATION_ID_PATTERN.test(conversationId)) {
    return { isValid: false, reason: 'The conversation id is missing or malformed.' };
  }
  if (typeof text !== 'string' || text.trim() === '') {
    return { isValid: false, reason: 'The message text is empty.' };
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { isValid: false, reason: `The message is longer than ${MAX_MESSAGE_LENGTH} characters.` };
  }
  return { isValid: true, conversationId, text: text.trim() };
}
