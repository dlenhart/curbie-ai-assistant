import type { ScanReport } from '../interfaces/scan-report.interface';

export type ScanStart =
  | { readonly kind: 'started'; readonly completion: Promise<ScanReport> }
  | { readonly kind: 'already_running' };
