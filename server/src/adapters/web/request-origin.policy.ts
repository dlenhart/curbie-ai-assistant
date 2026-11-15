import { isIP } from 'node:net';
import type { OriginCheckInput } from './interfaces/origin-check-input.interface';
import type { OriginVerdict } from './types/origin-verdict.type';

export function evaluateRequestOrigin(input: OriginCheckInput): OriginVerdict {
  if (input.host === undefined || input.host === '') return { isAllowed: false, reason: 'Refused: missing Host header.' };

  const hostname = parseHostname(input.host);
  if (hostname === undefined || (hostname !== 'localhost' && isIP(hostname) === 0)) {
    return { isAllowed: false, reason: 'Refused: Host must be an IP address or localhost.' };
  }

  if (input.origin === undefined) return { isAllowed: true };
  if (parseOriginHost(input.origin) !== input.host.toLowerCase()) {
    return { isAllowed: false, reason: 'Refused: Origin does not match Host.' };
  }
  return { isAllowed: true };
}

function parseHostname(host: string): string | undefined {
  try {
    return new URL(`http://${host}`).hostname.replace(/^\[(.*)\]$/, '$1');
  } catch {
    return undefined;
  }
}

function parseOriginHost(origin: string): string | undefined {
  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
}
