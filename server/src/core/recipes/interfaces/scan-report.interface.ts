import type { ScanProblem } from './scan-problem.interface';

export interface ScanReport {
  readonly finishedAt: string;
  readonly importedCount: number;
  readonly problems: readonly ScanProblem[];
}
