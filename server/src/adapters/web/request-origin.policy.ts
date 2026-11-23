import { isIP } from 'node:net';
import { SAFE_HTTP_METHODS, TRUSTED_FETCH_SITES } from '../../constants';
import type { OriginCheckInput } from './interfaces/origin-check-input.interface';
import type { OriginVerdict } from './types/origin-verdict.type';

export function evaluateRequestOrigin(input: OriginCheckInput): OriginVerdict {
  if (input.host === undefined || input.host === '') return { isAllowed: false, reason: 'Refused: missing Host header.' };

  const hostUrl = parseUrl(`http://${input.host}`);
  const hostname = hostUrl?.hostname.replace(/^\[(.*)\]$/, '$1');
  if (hostUrl === undefined || hostname === undefined || (hostname !== 'localhost' && isIP(hostname) === 0)) {
    return { isAllowed: false, reason: 'Refused: Host must be an IP address or localhost.' };
  }

  if (input.origin === undefined) return evaluateFetchMetadata(input);

  const originUrl = parseUrl(input.origin);
  if (originUrl === undefined || originUrl.protocol !== 'http:' || originUrl.host !== hostUrl.host) {
    return { isAllowed: false, reason: 'Refused: Origin does not match Host.' };
  }
  return { isAllowed: true };
}

function evaluateFetchMetadata(input: OriginCheckInput): OriginVerdict {
  const isSafeMethod = SAFE_HTTP_METHODS.has((input.method ?? '').toUpperCase());
  if (isSafeMethod || input.secFetchSite === undefined || TRUSTED_FETCH_SITES.has(input.secFetchSite)) {
    return { isAllowed: true };
  }
  return { isAllowed: false, reason: 'Refused: cross-site request without an Origin header.' };
}

function parseUrl(text: string): URL | undefined {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}
