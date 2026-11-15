export function buildSupportedTimeZones(hostTimeZone: string): ReadonlySet<string> {
  const zones = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
  if (isAcceptedTimeZone(hostTimeZone)) zones.add(hostTimeZone);
  return zones;
}

function isAcceptedTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
