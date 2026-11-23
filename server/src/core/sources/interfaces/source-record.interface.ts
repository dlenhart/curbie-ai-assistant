import type { SourceCard } from './source-card.interface';

export interface SourceRecord {
  readonly id: string;
  readonly skillName: string;
  readonly title: string;
  readonly content: string;
  readonly requiresQuote: boolean;
  readonly card?: SourceCard;
  readonly href?: string;
}
