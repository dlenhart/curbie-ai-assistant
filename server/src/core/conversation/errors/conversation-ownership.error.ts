export class ConversationOwnershipError extends Error {
  constructor(conversationId: string) {
    super(`Conversation ${conversationId} belongs to a different user.`);
    this.name = 'ConversationOwnershipError';
  }
}
