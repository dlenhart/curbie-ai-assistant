import type { Clock } from '../../core/shared/interfaces/clock.interface';
import type { SkillAdapter } from '../../core/skills/interfaces/skill-adapter.interface';
import type { ToolExecutionContext } from '../../core/skills/interfaces/tool-execution-context.interface';
import type { ToolResult } from '../../core/skills/interfaces/tool-result.interface';
import { ClockError } from './errors/clock.error';

export class ClockAdapter implements SkillAdapter {
  readonly name = 'clock';

  constructor(private readonly clock: Clock) {}

  async execute(
    toolName: string,
    _toolArguments: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    if (toolName !== 'current_date_time') {
      throw new ClockError(`Clock has no tool named "${toolName}".`);
    }
    const { timeZone } = context.settings;
    const formatted = new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'full', timeStyle: 'short' })
      .format(this.clock.now())
      .replace(/ /g, ' ');
    return { title: 'Clock', content: `${formatted} (${timeZone})`, requiresQuote: false };
  }
}
