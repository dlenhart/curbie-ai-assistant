export class UnknownConversationError extends Error {
  constructor(conversationId: string) {
    super(`Conversation ${conversationId} does not exist.`);
    this.name = 'UnknownConversationError';
  }
}
