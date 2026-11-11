import type { SourceRecord } from '../sources/interfaces/source-record.interface';
import type { StructuredAnswer } from './interfaces/structured-answer.interface';
import type { ContractVerdict } from './types/contract-verdict.type';

export function evaluateAnswerContract(
  answer: StructuredAnswer,
  sourcesById: ReadonlyMap<string, SourceRecord>,
): ContractVerdict {
  if (answer.text.trim() === '') return reject('The answer text is empty.');

  const unknownSourceIds = answer.sourceIds.filter((sourceId) => !sourcesById.has(sourceId));
  if (unknownSourceIds.length > 0) {
    return reject(`Cited source IDs that were not retrieved this turn: ${unknownSourceIds.join(', ')}.`);
  }

  for (const quote of answer.quotes) {
    const source = sourcesById.get(quote.sourceId);
    if (source === undefined || !answer.sourceIds.includes(quote.sourceId)) {
      return reject(`Quote references source "${quote.sourceId}", which is not listed in sourceIds.`);
    }
    if (!containsVerbatim(source.content, quote.quote)) {
      return reject(`Quote not found verbatim in source "${quote.sourceId}".`);
    }
  }

  if (answer.category === 'cited') {
    if (answer.sourceIds.length === 0) return reject('A cited answer must list at least one source ID.');
    for (const sourceId of answer.sourceIds) {
      const isQuoteRequired = sourcesById.get(sourceId)?.requiresQuote === true;
      if (isQuoteRequired && !answer.quotes.some((quote) => quote.sourceId === sourceId)) {
        return reject(`Source "${sourceId}" requires a verbatim quote.`);
      }
    }
  }

  return { isAccepted: true };
}

export function containsVerbatim(sourceText: string, quote: string): boolean {
  const normalizedQuote = normalizeWhitespace(quote);
  if (normalizedQuote === '') return false;
  return normalizeWhitespace(sourceText).includes(normalizedQuote);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function reject(reason: string): ContractVerdict {
  return { isAccepted: false, reason };
}
