import { buildSupportedTimeZones } from './supported-time-zones.factory';

describe('buildSupportedTimeZones', () => {
  it('includes the runtime zones and UTC', () => {
    const zones = buildSupportedTimeZones('America/Chicago');
    expect(zones.has('America/New_York')).toBe(true);
    expect(zones.has('UTC')).toBe(true);
  });

  it('adds the host zone when the runtime accepts it but does not list it', () => {
    expect(buildSupportedTimeZones('Etc/GMT+5').has('Etc/GMT+5')).toBe(true);
  });

  it('leaves out a host zone the runtime rejects', () => {
    expect(buildSupportedTimeZones('Etc/Unknown').has('Etc/Unknown')).toBe(false);
  });
});
