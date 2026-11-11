import { MalformedAnswerError } from './errors/malformed-answer.error';
import { parseStructuredAnswer } from './structured-answer.parser';

describe('parseStructuredAnswer', () => {
  it('parses a valid answer', () => {
    const raw = JSON.stringify({ category: 'cited', text: 'It is 51.', sourceIds: ['src_1'], quotes: [] });
    expect(parseStructuredAnswer(raw)).toEqual({ category: 'cited', text: 'It is 51.', sourceIds: ['src_1'], quotes: [] });
  });

  it.each([
    ['not JSON', 'definitely not json'],
    ['unknown category', JSON.stringify({ category: 'vibes', text: 'x', sourceIds: [], quotes: [] })],
    ['missing quotes', JSON.stringify({ category: 'dont_know', text: 'x', sourceIds: [] })],
    ['extra field', JSON.stringify({ category: 'dont_know', text: 'x', sourceIds: [], quotes: [], confidence: 1 })],
    ['non-string source id', JSON.stringify({ category: 'cited', text: 'x', sourceIds: [1], quotes: [] })],
    ['an array', '[]'],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseStructuredAnswer(raw)).toThrow(MalformedAnswerError);
  });
});
