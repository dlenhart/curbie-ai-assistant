import { SequentialIdGenerator } from '../testing/sequential-id.generator';
import { SkillRegistrationError } from './errors/skill-registration.error';
import type { SkillAdapter } from './interfaces/skill-adapter.interface';
import type { SkillDefinition } from './interfaces/skill-definition.interface';
import type { ToolExecutionContext } from './interfaces/tool-execution-context.interface';
import type { ToolResult } from './interfaces/tool-result.interface';
import { ToolRegistry } from './tool.registry';

const CONTEXT: ToolExecutionContext = {
  settings: { modelName: 'qwen3:4b-instruct', timeZone: 'America/Chicago', units: 'metric' },
};

function echoSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    name: 'echo',
    description: 'Repeats text back.',
    kind: 'lookup',
    adapterName: 'echo',
    instructions: 'Use echo_text to repeat text.',
    tools: [
      {
        name: 'echo_text',
        description: 'Repeat the given text.',
        parameters: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
          additionalProperties: false,
        },
      },
    ],
    ...overrides,
  };
}

class EchoAdapter implements SkillAdapter {
  readonly name = 'echo';
  readonly calls: Array<{ toolName: string; toolArguments: Record<string, unknown>; context: ToolExecutionContext }> =
    [];

  async execute(
    toolName: string,
    toolArguments: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    this.calls.push({ toolName, toolArguments, context });
    return { title: 'Echo', content: `echo: ${String(toolArguments.text)}`, requiresQuote: false };
  }
}

class FailingAdapter implements SkillAdapter {
  readonly name = 'echo';
  async execute(): Promise<ToolResult> {
    throw new Error('upstream service timed out');
  }
}

describe('ToolRegistry', () => {
  it('lists registered tool definitions and skills', () => {
    const registry = new ToolRegistry(new SequentialIdGenerator());
    registry.register(echoSkill(), new EchoAdapter());
    expect(registry.toolDefinitions().map((tool) => tool.name)).toEqual(['echo_text']);
    expect(registry.registeredSkills().map((skill) => skill.name)).toEqual(['echo']);
  });

  it('executes a valid call with the turn context and wraps the result as a source with a fresh ID', async () => {
    const registry = new ToolRegistry(new SequentialIdGenerator());
    const adapter = new EchoAdapter();
    registry.register(echoSkill(), adapter);

    const outcome = await registry.execute({ name: 'echo_text', arguments: { text: 'hi' } }, CONTEXT);

    expect(outcome).toEqual({
      kind: 'success',
      source: { id: 'src_1', skillName: 'echo', title: 'Echo', content: 'echo: hi', requiresQuote: false },
    });
    expect(adapter.calls).toEqual([{ toolName: 'echo_text', toolArguments: { text: 'hi' }, context: CONTEXT }]);
  });

  it('rejects unknown tools without calling any adapter', async () => {
    const registry = new ToolRegistry(new SequentialIdGenerator());
    const adapter = new EchoAdapter();
    registry.register(echoSkill(), adapter);

    const outcome = await registry.execute({ name: 'run_shell_command', arguments: { command: 'rm -rf ~' } }, CONTEXT);

    expect(outcome.kind).toBe('rejected');
    expect(outcome.kind === 'rejected' && outcome.reason).toMatch(/Unknown tool "run_shell_command"/);
    expect(adapter.calls).toEqual([]);
  });

  it('rejects arguments that violate the schema without calling the adapter', async () => {
    const registry = new ToolRegistry(new SequentialIdGenerator());
    const adapter = new EchoAdapter();
    registry.register(echoSkill(), adapter);

    const missing = await registry.execute({ name: 'echo_text', arguments: {} }, CONTEXT);
    const extra = await registry.execute({ name: 'echo_text', arguments: { text: 'hi', sneaky: true } }, CONTEXT);

    expect(missing.kind).toBe('rejected');
    expect(extra.kind).toBe('rejected');
    expect(adapter.calls).toEqual([]);
  });

  it('reports adapter failures as failed outcomes instead of throwing', async () => {
    const registry = new ToolRegistry(new SequentialIdGenerator());
    registry.register(echoSkill(), new FailingAdapter());

    const outcome = await registry.execute({ name: 'echo_text', arguments: { text: 'hi' } }, CONTEXT);

    expect(outcome).toEqual({ kind: 'failed', reason: 'echo_text failed: upstream service timed out' });
  });

  it('refuses a tool name declared by two skills', () => {
    const registry = new ToolRegistry(new SequentialIdGenerator());
    registry.register(echoSkill(), new EchoAdapter());
    expect(() => registry.register(echoSkill({ name: 'echo-two' }), new EchoAdapter())).toThrow(SkillRegistrationError);
  });

  it('refuses an invalid parameter schema at registration time', () => {
    const registry = new ToolRegistry(new SequentialIdGenerator());
    const broken = echoSkill({
      tools: [
        {
          name: 'echo_text',
          description: 'Broken.',
          parameters: { type: 'object', properties: { text: { type: 'not-a-type' } } },
        },
      ],
    });
    expect(() => registry.register(broken, new EchoAdapter())).toThrow(/invalid parameter schema/);
  });

  it('refuses an adapter whose name does not match the skill', () => {
    const registry = new ToolRegistry(new SequentialIdGenerator());
    expect(() => registry.register(echoSkill({ adapterName: 'weather' }), new EchoAdapter())).toThrow(
      /expects adapter "weather"/,
    );
  });
});
