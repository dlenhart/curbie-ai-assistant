import type { InboxGroup } from './inbox-group.interface';
import type { ScanProblem } from './scan-problem.interface';

export interface InboxGrouping {
  readonly groups: readonly InboxGroup[];
  readonly problems: readonly ScanProblem[];
}
