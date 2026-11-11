import { DONT_KNOW_FALLBACK_TEXT } from '../../constants';
import { ModelUnavailableError } from '../model/errors/model-unavailable.error';
import type { SkillAdapter } from '../skills/interfaces/skill-adapter.interface';
import type { SkillDefinition } from '../skills/interfaces/skill-definition.interface';
import type { ToolResult } from '../skills/interfaces/tool-result.interface';
import { ToolRegistry } from '../skills/tool.registry';
import { FixedClock } from '../testing/fixed.clock';
import { InMemoryTranscriptRepository } from '../testing/in-memory-transcript.repository';
import { answerResponse, ScriptedModel, textResponse, toolCallResponse } from '../testing/scripted.model';
import { SequentialIdGenerator } from '../testing/sequential-id.generator';
import { ConversationOrchestrator } from './conversation.orchestrator';
import { EmptyMessageError } from './errors/empty-message.error';

const adderSkill: SkillDefinition = {
  name: 'adder',
  description: 'Adds numbers.',
  kind: 'lookup',
  adapterName: 'adder',
  instructions: 'Use add_numbers.',
  tools: [
    {
      name: 'add_numbers',
      description: 'Add two numbers.',
      parameters: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
        additionalProperties: false,
      },
    },
  ],
};

class AdderAdapter implements SkillAdapter {
  readonly name = 'adder';
  async execute(_toolName: string, toolArguments: Record<string, unknown>): Promise<ToolResult> {
    const sum = Number(toolArguments.a) + Number(toolArguments.b);
    return { title: 'Adder', content: `${toolArguments.a} + ${toolArguments.b} = ${sum}`, requiresQuote: false };
  }
}

function createOrchestrator(model: ScriptedModel, overrides: { maxToolRounds?: number; historyMessageLimit?: number } = {}) {
  const idGenerator = new SequentialIdGenerator();
  const toolRegistry = new ToolRegistry(idGenerator);
  toolRegistry.register(adderSkill, new AdderAdapter());
  const transcripts = new InMemoryTranscriptRepository();
  const orchestrator = new ConversationOrchestrator({
    model,
    toolRegistry,
    transcripts,
    clock: new FixedClock(new Date('2026-10-01T12:00:00.000Z')),
    idGenerator,
    systemPrompt: 'SYSTEM PROMPT',
    historyMessageLimit: overrides.historyMessageLimit ?? 10,
    maxToolRounds: overrides.maxToolRounds ?? 4,
  });
  return { orchestrator, transcripts };
}

const input = { userId: 'owner', conversationId: 'conv_1', text: 'What is 2 + 3?' };

describe('ConversationOrchestrator', () => {
  it('runs a tool, verifies the cited answer, and returns it with harness-rendered citations', async () => {
    const model = new ScriptedModel([
      toolCallResponse('add_numbers', { a: 2, b: 3 }),
      textResponse('It is 5.'),
      answerResponse({ category: 'cited', text: '2 + 3 is 5.', sourceIds: ['src_1'], quotes: [] }),
    ]);
    const { orchestrator, transcripts } = createOrchestrator(model);

    const reply = await orchestrator.handleUserMessage(input);

    expect(reply).toEqual({
      conversationId: 'conv_1',
      category: 'cited',
      text: '2 + 3 is 5.',
      citations: [{ sourceId: 'src_1', title: 'Adder', skillName: 'adder' }],
    });
    const toolMessage = model.receivedRequests[1].messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toContain('<source id="src_1" title="Adder">');
    expect(toolMessage?.content).toContain('2 + 3 = 5');
    expect(transcripts.recentMessages('conv_1', 10).map((m) => [m.role, m.content, m.category, m.citations])).toEqual([
      ['user', 'What is 2 + 3?', null, []],
      ['assistant', '2 + 3 is 5.', 'cited', [{ sourceId: 'src_1', title: 'Adder', skillName: 'adder' }]],
    ]);
  });

  it('gathers with tools and no schema, then finalizes with the schema and no tools', async () => {
    const model = new ScriptedModel([
      textResponse('Hello!'),
      answerResponse({ category: 'conversational', text: 'Hello!', sourceIds: [], quotes: [] }),
    ]);
    const { orchestrator } = createOrchestrator(model);

    await orchestrator.handleUserMessage({ ...input, text: 'hi' });

    const [gatherRequest, finalizeRequest] = model.receivedRequests;
    expect(gatherRequest.tools.map((tool) => tool.name)).toEqual(['add_numbers']);
    expect(gatherRequest.responseSchema).toBeUndefined();
    expect(gatherRequest.messages[0]).toEqual({ role: 'system', content: 'SYSTEM PROMPT' });
    expect(finalizeRequest.tools).toEqual([]);
    expect(finalizeRequest.responseSchema).toBeDefined();
    expect(finalizeRequest.messages.at(-1)?.content).toContain('Source IDs available this turn: none');
  });

  it('re-prompts once when a citation is invented, and accepts a corrected answer', async () => {
    const model = new ScriptedModel([
      textResponse('It is 5.'),
      answerResponse({ category: 'cited', text: 'It is 5.', sourceIds: ['src_42'], quotes: [] }),
      answerResponse({ category: 'dont_know', text: "I can't verify that.", sourceIds: [], quotes: [] }),
    ]);
    const { orchestrator } = createOrchestrator(model);

    const reply = await orchestrator.handleUserMessage(input);

    expect(reply.category).toBe('dont_know');
    expect(reply.text).toBe("I can't verify that.");
    expect(model.receivedRequests[2].messages.at(-1)?.content).toContain('src_42');
  });

  it('falls back to "don\'t know" after two rejected answers', async () => {
    const model = new ScriptedModel([
      textResponse(''),
      answerResponse({ category: 'cited', text: 'Paris.', sourceIds: [], quotes: [] }),
      answerResponse({ category: 'cited', text: 'Paris, definitely.', sourceIds: [], quotes: [] }),
    ]);
    const { orchestrator, transcripts } = createOrchestrator(model);

    const reply = await orchestrator.handleUserMessage(input);

    expect(reply).toEqual({ conversationId: 'conv_1', category: 'dont_know', text: DONT_KNOW_FALLBACK_TEXT, citations: [] });
    expect(transcripts.recentMessages('conv_1', 1)[0].content).toBe(DONT_KNOW_FALLBACK_TEXT);
  });

  it('re-prompts when the finalize output is not valid JSON', async () => {
    const model = new ScriptedModel([
      textResponse(''),
      textResponse('Sure! The answer is 5.'),
      answerResponse({ category: 'dont_know', text: "I don't know.", sourceIds: [], quotes: [] }),
    ]);
    const { orchestrator } = createOrchestrator(model);

    const reply = await orchestrator.handleUserMessage(input);

    expect(reply.category).toBe('dont_know');
    expect(model.receivedRequests[2].messages.at(-1)?.content).toContain('not valid JSON');
  });

  it('feeds rejected tool calls back to the model without creating a source', async () => {
    const model = new ScriptedModel([
      toolCallResponse('run_shell_command', { command: 'rm -rf ~' }),
      textResponse(''),
      answerResponse({ category: 'dont_know', text: "I can't do that.", sourceIds: [], quotes: [] }),
    ]);
    const { orchestrator } = createOrchestrator(model);

    const reply = await orchestrator.handleUserMessage(input);

    const toolMessage = model.receivedRequests[1].messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toContain('TOOL CALL REJECTED: Unknown tool "run_shell_command"');
    expect(model.receivedRequests[2].messages.at(-1)?.content).toContain('Source IDs available this turn: none');
    expect(reply.citations).toEqual([]);
  });

  it('stops with an error reply when tool rounds run out, without asking for a final answer', async () => {
    const model = new ScriptedModel([
      toolCallResponse('add_numbers', { a: 1, b: 1 }),
      toolCallResponse('add_numbers', { a: 2, b: 2 }),
    ]);
    const { orchestrator } = createOrchestrator(model, { maxToolRounds: 2 });

    const reply = await orchestrator.handleUserMessage(input);

    expect(reply.category).toBe('error');
    expect(reply.text).toContain('2 tool steps');
    expect(model.receivedRequests).toHaveLength(2);
  });

  it('rejects citations of sources retrieved in an earlier turn', async () => {
    const model = new ScriptedModel([
      toolCallResponse('add_numbers', { a: 2, b: 3 }),
      textResponse(''),
      answerResponse({ category: 'cited', text: '5.', sourceIds: ['src_1'], quotes: [] }),
      textResponse(''),
      answerResponse({ category: 'cited', text: 'Still 5.', sourceIds: ['src_1'], quotes: [] }),
      answerResponse({ category: 'cited', text: 'Still 5!', sourceIds: ['src_1'], quotes: [] }),
    ]);
    const { orchestrator } = createOrchestrator(model);

    await orchestrator.handleUserMessage(input);
    const secondReply = await orchestrator.handleUserMessage({ ...input, text: 'Are you sure?' });

    expect(secondReply.category).toBe('dont_know');
    expect(secondReply.text).toBe(DONT_KNOW_FALLBACK_TEXT);
  });

  it('includes earlier turns of the conversation as history, limited by historyMessageLimit', async () => {
    const model = new ScriptedModel([
      textResponse(''),
      answerResponse({ category: 'conversational', text: 'Hi there.', sourceIds: [], quotes: [] }),
      textResponse(''),
      answerResponse({ category: 'conversational', text: 'Still here.', sourceIds: [], quotes: [] }),
    ]);
    const { orchestrator } = createOrchestrator(model, { historyMessageLimit: 2 });

    await orchestrator.handleUserMessage({ ...input, text: 'hello' });
    await orchestrator.handleUserMessage({ ...input, text: 'you there?' });

    const secondGather = model.receivedRequests[2];
    expect(secondGather.messages).toEqual([
      { role: 'system', content: 'SYSTEM PROMPT' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hi there.', toolCalls: [] },
      { role: 'user', content: 'you there?' },
    ]);
  });

  it('deduplicates repeated source IDs in citations', async () => {
    const model = new ScriptedModel([
      toolCallResponse('add_numbers', { a: 2, b: 3 }),
      textResponse(''),
      answerResponse({ category: 'cited', text: '5.', sourceIds: ['src_1', 'src_1'], quotes: [] }),
    ]);
    const { orchestrator } = createOrchestrator(model);

    const reply = await orchestrator.handleUserMessage(input);

    expect(reply.citations).toHaveLength(1);
  });

  it('refuses an empty message before calling the model', async () => {
    const model = new ScriptedModel([]);
    const { orchestrator } = createOrchestrator(model);
    await expect(orchestrator.handleUserMessage({ ...input, text: '   ' })).rejects.toThrow(EmptyMessageError);
    expect(model.receivedRequests).toHaveLength(0);
  });

  it('propagates ModelUnavailableError so the interface can report it', async () => {
    const model = new ScriptedModel([new ModelUnavailableError('connection refused')]);
    const { orchestrator } = createOrchestrator(model);
    await expect(orchestrator.handleUserMessage(input)).rejects.toThrow(ModelUnavailableError);
  });
});
