import type { IncomingMessage } from 'node:http';
import type { OriginCheckInput } from './interfaces/origin-check-input.interface';

export function readOriginCheckInput(request: IncomingMessage): OriginCheckInput {
  return {
    host: request.headers.host,
    origin: request.headers.origin || undefined,
    method: request.method,
    secFetchSite: request.headers['sec-fetch-site'],
  };
}
