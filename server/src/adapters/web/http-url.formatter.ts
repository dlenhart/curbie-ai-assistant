import { isIPv6 } from 'node:net';

export function formatHttpUrl(host: string, port: number): string {
  return isIPv6(host) ? `http://[${host}]:${port}` : `http://${host}:${port}`;
}
