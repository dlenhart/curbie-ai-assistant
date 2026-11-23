import type { OriginCheckInput } from './interfaces/origin-check-input.interface';
import { evaluateRequestOrigin } from './request-origin.policy';

function check(overrides: Partial<OriginCheckInput>): ReturnType<typeof evaluateRequestOrigin> {
  return evaluateRequestOrigin({
    host: '192.168.1.20:3000',
    origin: undefined,
    method: 'GET',
    secFetchSite: undefined,
    ...overrides,
  });
}

function expectRefused(verdict: ReturnType<typeof evaluateRequestOrigin>, reasonFragment: string): void {
  expect(verdict.isAllowed).toBe(false);
  expect(verdict.isAllowed === false && verdict.reason).toContain(reasonFragment);
}

describe('evaluateRequestOrigin', () => {
  it.each([
    ['127.0.0.1:3000', undefined],
    ['192.168.1.20:3000', 'http://192.168.1.20:3000'],
    ['192.168.1.20', 'http://192.168.1.20'],
    ['192.168.1.20:80', 'http://192.168.1.20'],
    ['localhost:3000', 'http://localhost:3000'],
    ['LOCALHOST:3000', 'http://localhost:3000'],
    ['[::1]:3000', 'http://[::1]:3000'],
    ['[0:0:0:0:0:0:0:1]:3000', 'http://[::1]:3000'],
  ])('allows host %s with origin %s', (host, origin) => {
    expect(check({ host, origin })).toEqual({ isAllowed: true });
  });

  it.each([
    [undefined, undefined, 'missing Host header'],
    ['curbie.example:3000', undefined, 'Host must be an IP address or localhost'],
    ['192.168.1.20:3000', 'http://evil.example', 'Origin does not match Host'],
    ['192.168.1.20:3000', 'http://192.168.1.20:4000', 'Origin does not match Host'],
    ['192.168.1.20:3000', 'https://192.168.1.20:3000', 'Origin does not match Host'],
    ['192.168.1.20:3000', 'null', 'Origin does not match Host'],
  ])('refuses host %s with origin %s', (host, origin, reasonFragment) => {
    expectRefused(check({ host, origin }), reasonFragment);
  });

  describe('a POST with no Origin header', () => {
    it.each([['cross-site'], ['same-site'], ['none, cross-site']])(
      'is refused when the browser says it is %s',
      (secFetchSite) => {
        expectRefused(check({ method: 'POST', secFetchSite }), 'cross-site request without an Origin header');
      },
    );

    it.each([['same-origin'], ['none'], [undefined]])('is allowed when Sec-Fetch-Site is %s', (secFetchSite) => {
      expect(check({ method: 'POST', secFetchSite })).toEqual({ isAllowed: true });
    });
  });

  it('allows a cross-site GET with no Origin header, so links to Curbie still work', () => {
    expect(check({ method: 'GET', secFetchSite: 'cross-site' })).toEqual({ isAllowed: true });
  });
});
