import type { SkillAdapter } from '../../core/skills/interfaces/skill-adapter.interface';
import type { ToolResult } from '../../core/skills/interfaces/tool-result.interface';
import { ClockError } from './errors/clock.error';
import type { SkillAdapterDependencies } from './interfaces/skill-adapter-dependencies.interface';

export class ClockAdapter implements SkillAdapter {
  readonly name = 'clock';

  constructor(private readonly dependencies: SkillAdapterDependencies) {}

  async execute(toolName: string, _toolArguments: Record<string, unknown>): Promise<ToolResult> {
    if (toolName !== 'current_date_time') {
      throw new ClockError(`Clock has no tool named "${toolName}".`);
    }
    const { timeZone } = this.dependencies.settings.current();
    const formatted = new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'full', timeStyle: 'short' })
      .format(this.dependencies.clock.now())
      .replace(/ /g, ' ');
    return { title: 'Clock', content: `${formatted} (${timeZone})`, requiresQuote: false };
  }
}
