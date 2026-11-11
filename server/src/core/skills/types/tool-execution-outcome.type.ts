import type { SourceRecord } from '../../sources/interfaces/source-record.interface';

export type ToolExecutionOutcome =
  | { readonly kind: 'success'; readonly source: SourceRecord }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };
