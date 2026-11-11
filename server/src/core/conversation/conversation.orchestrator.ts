import { DONT_KNOW_FALLBACK_TEXT, MAX_FINALIZE_ATTEMPTS, STRUCTURED_ANSWER_SCHEMA } from '../../constants';
import { evaluateAnswerContract } from '../answers/answer.contract';
import { MalformedAnswerError } from '../answers/errors/malformed-answer.error';
import type { Citation } from '../answers/interfaces/citation.interface';
import type { StructuredAnswer } from '../answers/interfaces/structured-answer.interface';
import { parseStructuredAnswer } from '../answers/structured-answer.parser';
import type { ChatMessage } from '../model/types/chat-message.type';
import type { SourceRecord } from '../sources/interfaces/source-record.interface';
import { EmptyMessageError } from './errors/empty-message.error';
import type { AssistantReply } from './interfaces/assistant-reply.interface';
import type { ConversationOrchestratorDependencies } from './interfaces/conversation-orchestrator-dependencies.interface';
import type { StoredMessage } from './interfaces/stored-message.interface';
import type { UserMessageInput } from './interfaces/user-message-input.interface';
import { buildFinalizeInstruction, buildRejectionNotice } from './system-prompt.builder';
import { formatToolOutcome } from './tool-outcome.formatter';
import type { ReplyCategory } from './types/reply-category.type';
import type { StoredMessageRole } from './types/stored-message-role.type';

export class ConversationOrchestrator {
  constructor(private readonly dependencies: ConversationOrchestratorDependencies) {}

  async handleUserMessage(input: UserMessageInput): Promise<AssistantReply> {
    const text = input.text.trim();
    if (text === '') throw new EmptyMessageError();

    const { transcripts, historyMessageLimit, systemPrompt, maxToolRounds } = this.dependencies;
    transcripts.ensureConversation(input.conversationId, input.userId, this.timestamp());
    const history = transcripts.recentMessages(input.conversationId, historyMessageLimit);
    this.recordMessage(input.conversationId, 'user', text, null, []);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(toChatMessage),
      { role: 'user', content: text },
    ];
    const sourcesById = new Map<string, SourceRecord>();

    const hasFinishedGathering = await this.gatherWithTools(messages, sourcesById);
    if (!hasFinishedGathering) {
      return this.reply(
        input.conversationId,
        'error',
        `I stopped after ${maxToolRounds} tool steps without finishing, rather than guess.`,
        [],
        sourcesById,
      );
    }

    const answer = await this.produceVerifiedAnswer(messages, sourcesById);
    return this.reply(input.conversationId, answer.category, answer.text, answer.sourceIds, sourcesById);
  }

  private async gatherWithTools(messages: ChatMessage[], sourcesById: Map<string, SourceRecord>): Promise<boolean> {
    const { model, toolRegistry, maxToolRounds } = this.dependencies;
    const tools = toolRegistry.toolDefinitions();
    for (let round = 0; round < maxToolRounds; round++) {
      const response = await model.chat({ messages, tools });
      if (response.toolCalls.length === 0) return true;

      messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });
      for (const call of response.toolCalls) {
        const outcome = await toolRegistry.execute(call);
        if (outcome.kind === 'success') sourcesById.set(outcome.source.id, outcome.source);
        messages.push({ role: 'tool', toolName: call.name, content: formatToolOutcome(outcome) });
      }
    }
    return false;
  }

  private async produceVerifiedAnswer(
    messages: readonly ChatMessage[],
    sourcesById: ReadonlyMap<string, SourceRecord>,
  ): Promise<StructuredAnswer> {
    const finalizeMessages: ChatMessage[] = [
      ...messages,
      { role: 'system', content: buildFinalizeInstruction([...sourcesById.keys()]) },
    ];

    for (let attempt = 1; attempt <= MAX_FINALIZE_ATTEMPTS; attempt++) {
      const response = await this.dependencies.model.chat({
        messages: finalizeMessages,
        tools: [],
        responseSchema: STRUCTURED_ANSWER_SCHEMA,
      });

      let rejectionReason: string;
      try {
        const answer = parseStructuredAnswer(response.content);
        const verdict = evaluateAnswerContract(answer, sourcesById);
        if (verdict.isAccepted) return answer;
        rejectionReason = verdict.reason;
      } catch (error) {
        if (!(error instanceof MalformedAnswerError)) throw error;
        rejectionReason = error.message;
      }

      finalizeMessages.push({ role: 'assistant', content: response.content, toolCalls: [] });
      finalizeMessages.push({ role: 'system', content: buildRejectionNotice(rejectionReason) });
    }

    return { category: 'dont_know', text: DONT_KNOW_FALLBACK_TEXT, sourceIds: [], quotes: [] };
  }

  private reply(
    conversationId: string,
    category: ReplyCategory,
    text: string,
    sourceIds: readonly string[],
    sourcesById: ReadonlyMap<string, SourceRecord>,
  ): AssistantReply {
    const citations: Citation[] = [...new Set(sourceIds)].map((sourceId) => {
      const source = sourcesById.get(sourceId);
      if (source === undefined) {
        throw new Error(`Invariant violated: cited source ${sourceId} is missing after the contract check.`);
      }
      return { sourceId: source.id, title: source.title, skillName: source.skillName };
    });
    this.recordMessage(conversationId, 'assistant', text, category, citations);
    return { conversationId, category, text, citations };
  }

  private recordMessage(
    conversationId: string,
    role: StoredMessageRole,
    content: string,
    category: ReplyCategory | null,
    citations: readonly Citation[],
  ): void {
    this.dependencies.transcripts.appendMessage({
      id: this.dependencies.idGenerator.next('msg'),
      conversationId,
      role,
      content,
      category,
      citations,
      createdAt: this.timestamp(),
    });
  }

  private timestamp(): string {
    return this.dependencies.clock.now().toISOString();
  }
}

function toChatMessage(stored: StoredMessage): ChatMessage {
  return stored.role === 'user'
    ? { role: 'user', content: stored.content }
    : { role: 'assistant', content: stored.content, toolCalls: [] };
}
