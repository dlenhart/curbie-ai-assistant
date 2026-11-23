import type { IncomingMessage } from 'node:http';
import { readOriginCheckInput } from './origin-check-input.reader';

function requestWith(method: string, headers: IncomingMessage['headers']): IncomingMessage {
  return { method, headers } as IncomingMessage;
}

describe('readOriginCheckInput', () => {
  it('reads the host, origin, method, and Sec-Fetch-Site headers', () => {
    const input = readOriginCheckInput(
      requestWith('POST', { host: '192.168.1.20:3000', origin: 'http://192.168.1.20:3000', 'sec-fetch-site': 'same-origin' }),
    );
    expect(input).toEqual({
      host: '192.168.1.20:3000',
      origin: 'http://192.168.1.20:3000',
      method: 'POST',
      secFetchSite: 'same-origin',
    });
  });

  it('treats an empty Origin header as absent', () => {
    expect(readOriginCheckInput(requestWith('GET', { host: '127.0.0.1:3000', origin: '' })).origin).toBeUndefined();
  });
});
