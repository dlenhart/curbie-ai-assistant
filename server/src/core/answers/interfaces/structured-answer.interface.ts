import type { AnswerCategory } from '../types/answer-category.type';
import type { AnswerQuote } from './answer-quote.interface';

export interface StructuredAnswer {
  readonly category: AnswerCategory;
  readonly text: string;
  readonly sourceIds: readonly string[];
  readonly quotes: readonly AnswerQuote[];
}
