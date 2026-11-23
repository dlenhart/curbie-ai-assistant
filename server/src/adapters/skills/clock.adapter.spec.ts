import type { ToolExecutionContext } from '../../core/skills/interfaces/tool-execution-context.interface';
import { FixedClock } from '../../core/testing/fixed.clock';
import { ClockAdapter } from './clock.adapter';
import { ClockError } from './errors/clock.error';

const NOW = new Date('2026-11-15T19:05:00.000Z');

function contextIn(timeZone: string): ToolExecutionContext {
  return { settings: { modelName: 'qwen3:4b-instruct', timeZone, units: 'imperial' } };
}

describe('ClockAdapter', () => {
  const adapter = new ClockAdapter(new FixedClock(NOW));

  it("reports the date and time in the turn's household time zone", async () => {
    await expect(adapter.execute('current_date_time', {}, contextIn('America/New_York'))).resolves.toEqual({
      title: 'Clock',
      content: 'Sunday, November 15, 2026 at 2:05 PM (America/New_York)',
      requiresQuote: false,
    });
  });

  it('rolls the date over for zones ahead of UTC', async () => {
    const result = await adapter.execute('current_date_time', {}, contextIn('Asia/Tokyo'));
    expect(result.content).toBe('Monday, November 16, 2026 at 4:05 AM (Asia/Tokyo)');
  });

  it('separates the time from AM/PM with a plain space', async () => {
    const result = await adapter.execute('current_date_time', {}, contextIn('America/New_York'));
    expect(result.content).not.toContain('\u202F');
  });

  it('rejects an unknown tool name', async () => {
    await expect(adapter.execute('set_alarm', {}, contextIn('UTC'))).rejects.toThrow(ClockError);
  });
});
