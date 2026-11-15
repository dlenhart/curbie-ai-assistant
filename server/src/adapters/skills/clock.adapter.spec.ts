import { FixedClock } from '../../core/testing/fixed.clock';
import { FixedSettingsReader } from '../../core/testing/fixed-settings.reader';
import { ClockAdapter } from './clock.adapter';
import { ClockError } from './errors/clock.error';

const NOW = new Date('2026-11-15T19:05:00.000Z');

function createAdapter(timeZone: string): { adapter: ClockAdapter; settings: FixedSettingsReader } {
  const settings = new FixedSettingsReader({ modelName: 'qwen3:4b-instruct', timeZone, units: 'imperial' });
  return { adapter: new ClockAdapter({ clock: new FixedClock(NOW), settings }), settings };
}

describe('ClockAdapter', () => {
  it('reports the date and time in the household time zone', async () => {
    const { adapter } = createAdapter('America/New_York');
    await expect(adapter.execute('current_date_time', {})).resolves.toEqual({
      title: 'Clock',
      content: 'Sunday, November 15, 2026 at 2:05 PM (America/New_York)',
      requiresQuote: false,
    });
  });

  it('rolls the date over for zones ahead of UTC', async () => {
    const result = await createAdapter('Asia/Tokyo').adapter.execute('current_date_time', {});
    expect(result.content).toBe('Monday, November 16, 2026 at 4:05 AM (Asia/Tokyo)');
  });

  it('reads the time zone from the settings on every call', async () => {
    const { adapter, settings } = createAdapter('America/New_York');
    settings.replace({ modelName: 'qwen3:4b-instruct', timeZone: 'America/Chicago', units: 'imperial' });
    const result = await adapter.execute('current_date_time', {});
    expect(result.content).toBe('Sunday, November 15, 2026 at 1:05 PM (America/Chicago)');
  });

  it('rejects an unknown tool name', async () => {
    await expect(createAdapter('UTC').adapter.execute('set_alarm', {})).rejects.toThrow(ClockError);
  });
});
