import { evaluateRequestOrigin } from './request-origin.policy';

describe('evaluateRequestOrigin', () => {
  it.each([
    ['127.0.0.1:3000', undefined],
    ['192.168.1.20:3000', 'http://192.168.1.20:3000'],
    ['192.168.1.20', 'http://192.168.1.20'],
    ['localhost:3000', 'http://localhost:3000'],
    ['[::1]:3000', 'http://[::1]:3000'],
  ])('allows host %s with origin %s', (host, origin) => {
    expect(evaluateRequestOrigin({ host, origin })).toEqual({ isAllowed: true });
  });

  it.each([
    [undefined, undefined, 'missing Host header'],
    ['curbie.example:3000', undefined, 'Host must be an IP address or localhost'],
    ['192.168.1.20:3000', 'http://evil.example', 'Origin does not match Host'],
    ['192.168.1.20:3000', 'http://192.168.1.20:4000', 'Origin does not match Host'],
    ['192.168.1.20:3000', 'null', 'Origin does not match Host'],
  ])('refuses host %s with origin %s', (host, origin, reasonFragment) => {
    const verdict = evaluateRequestOrigin({ host, origin });
    expect(verdict.isAllowed).toBe(false);
    expect(verdict.isAllowed === false && verdict.reason).toContain(reasonFragment);
  });
});
