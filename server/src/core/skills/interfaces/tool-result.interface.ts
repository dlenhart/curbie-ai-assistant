import type { SourceCard } from '../../sources/interfaces/source-card.interface';

export interface ToolResult {
  readonly title: string;
  readonly content: string;
  readonly requiresQuote: boolean;
  readonly card?: SourceCard;
  readonly href?: string;
}
