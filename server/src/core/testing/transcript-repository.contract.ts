import { ConversationOwnershipError } from '../conversation/errors/conversation-ownership.error';
import { UnknownConversationError } from '../conversation/errors/unknown-conversation.error';
import type { StoredMessage } from '../conversation/interfaces/stored-message.interface';
import type { TranscriptRepository } from '../conversation/interfaces/transcript-repository.interface';

function message(conversationId: string, sequence: number, role: StoredMessage['role'] = 'user'): StoredMessage {
  return {
    id: `msg_${conversationId}_${sequence}`,
    conversationId,
    role,
    content: `message ${sequence}`,
    category: role === 'assistant' ? 'cited' : null,
    citations: role === 'assistant' ? [{ sourceId: `src_${sequence}`, title: 'Calculator', skillName: 'calculator' }] : [],
    createdAt: '2026-10-01T12:00:00.000Z',
  };
}

export function describeTranscriptRepositoryContract(name: string, createRepository: () => TranscriptRepository): void {
  describe(`${name} (TranscriptRepository contract)`, () => {
    let repository: TranscriptRepository;

    beforeEach(() => {
      repository = createRepository();
    });

    it('returns no messages for an unknown conversation', () => {
      expect(repository.recentMessages('conv_missing', 10)).toEqual([]);
    });

    it('returns appended messages oldest first', () => {
      repository.ensureConversation('conv_a', 'owner', '2026-10-01T12:00:00.000Z');
      repository.appendMessage(message('conv_a', 1));
      repository.appendMessage(message('conv_a', 2, 'assistant'));
      expect(repository.recentMessages('conv_a', 10).map((m) => m.id)).toEqual(['msg_conv_a_1', 'msg_conv_a_2']);
    });

    it('preserves every stored field', () => {
      repository.ensureConversation('conv_a', 'owner', '2026-10-01T12:00:00.000Z');
      const stored = message('conv_a', 1, 'assistant');
      repository.appendMessage(stored);
      expect(repository.recentMessages('conv_a', 1)).toEqual([stored]);
    });

    it('limits to the most recent messages, still oldest first', () => {
      repository.ensureConversation('conv_a', 'owner', '2026-10-01T12:00:00.000Z');
      for (let sequence = 1; sequence <= 5; sequence++) repository.appendMessage(message('conv_a', sequence));
      expect(repository.recentMessages('conv_a', 2).map((m) => m.id)).toEqual(['msg_conv_a_4', 'msg_conv_a_5']);
    });

    it('returns nothing when the limit is zero', () => {
      repository.ensureConversation('conv_a', 'owner', '2026-10-01T12:00:00.000Z');
      repository.appendMessage(message('conv_a', 1));
      expect(repository.recentMessages('conv_a', 0)).toEqual([]);
    });

    it('keeps conversations separate', () => {
      repository.ensureConversation('conv_a', 'owner', '2026-10-01T12:00:00.000Z');
      repository.ensureConversation('conv_b', 'owner', '2026-10-01T12:00:00.000Z');
      repository.appendMessage(message('conv_a', 1));
      repository.appendMessage(message('conv_b', 1));
      expect(repository.recentMessages('conv_a', 10).map((m) => m.id)).toEqual(['msg_conv_a_1']);
    });

    it('treats ensureConversation as idempotent for the same user', () => {
      repository.ensureConversation('conv_a', 'owner', '2026-10-01T12:00:00.000Z');
      expect(() => repository.ensureConversation('conv_a', 'owner', '2026-10-01T12:05:00.000Z')).not.toThrow();
    });

    it("refuses another user's conversation", () => {
      repository.ensureConversation('conv_a', 'owner', '2026-10-01T12:00:00.000Z');
      expect(() => repository.ensureConversation('conv_a', 'someone_else', '2026-10-01T12:00:00.000Z')).toThrow(
        ConversationOwnershipError,
      );
    });

    it('refuses messages for a conversation that was never created', () => {
      expect(() => repository.appendMessage(message('conv_never', 1))).toThrow(UnknownConversationError);
    });
  });
}
