import { formatHttpUrl } from './http-url.formatter';

describe('formatHttpUrl', () => {
  it.each([
    ['127.0.0.1', 3000, 'http://127.0.0.1:3000'],
    ['0.0.0.0', 3000, 'http://0.0.0.0:3000'],
    ['localhost', 8080, 'http://localhost:8080'],
    ['::', 3000, 'http://[::]:3000'],
    ['::1', 3000, 'http://[::1]:3000'],
    ['fe80::1', 3000, 'http://[fe80::1]:3000'],
  ])('formats host %s and port %d as %s', (host, port, expected) => {
    expect(formatHttpUrl(host, port)).toBe(expected);
  });
});
