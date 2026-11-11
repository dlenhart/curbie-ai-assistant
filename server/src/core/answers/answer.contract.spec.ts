import type { SourceRecord } from '../sources/interfaces/source-record.interface';
import { containsVerbatim, evaluateAnswerContract } from './answer.contract';
import type { StructuredAnswer } from './interfaces/structured-answer.interface';

const calculatorSource: SourceRecord = {
  id: 'src_1',
  skillName: 'calculator',
  title: 'Calculator',
  content: '0.15 * 340 = 51',
  requiresQuote: false,
};
const manualSource: SourceRecord = {
  id: 'src_2',
  skillName: 'documents',
  title: 'Microwave manual, p. 14',
  content: 'To reset the front panel,\n  hold STOP for   three seconds.',
  requiresQuote: true,
};
const sources = new Map([calculatorSource, manualSource].map((source) => [source.id, source]));

function answer(overrides: Partial<StructuredAnswer>): StructuredAnswer {
  return { category: 'cited', text: 'Answer.', sourceIds: [], quotes: [], ...overrides };
}

describe('evaluateAnswerContract', () => {
  it('accepts a cited answer backed by a retrieved source', () => {
    expect(evaluateAnswerContract(answer({ sourceIds: ['src_1'] }), sources)).toEqual({ isAccepted: true });
  });

  it('rejects a cited answer with no sources', () => {
    expect(evaluateAnswerContract(answer({ sourceIds: [] }), sources)).toEqual({
      isAccepted: false,
      reason: 'A cited answer must list at least one source ID.',
    });
  });

  it('rejects a source ID that was never retrieved (invented or from an earlier turn)', () => {
    const verdict = evaluateAnswerContract(answer({ sourceIds: ['src_1', 'src_99'] }), sources);
    expect(verdict).toEqual({ isAccepted: false, reason: 'Cited source IDs that were not retrieved this turn: src_99.' });
  });

  it('requires a verbatim quote for sources that need one', () => {
    const verdict = evaluateAnswerContract(answer({ sourceIds: ['src_2'] }), sources);
    expect(verdict).toEqual({ isAccepted: false, reason: 'Source "src_2" requires a verbatim quote.' });
  });

  it('accepts a quote that matches apart from whitespace', () => {
    const verdict = evaluateAnswerContract(
      answer({ sourceIds: ['src_2'], quotes: [{ sourceId: 'src_2', quote: 'hold STOP for three seconds.' }] }),
      sources,
    );
    expect(verdict).toEqual({ isAccepted: true });
  });

  it('rejects a paraphrased quote', () => {
    const verdict = evaluateAnswerContract(
      answer({ sourceIds: ['src_2'], quotes: [{ sourceId: 'src_2', quote: 'press STOP for five seconds.' }] }),
      sources,
    );
    expect(verdict).toEqual({ isAccepted: false, reason: 'Quote not found verbatim in source "src_2".' });
  });

  it('rejects a quote attributed to a source not listed in sourceIds', () => {
    const verdict = evaluateAnswerContract(
      answer({ sourceIds: ['src_1'], quotes: [{ sourceId: 'src_2', quote: 'hold STOP' }] }),
      sources,
    );
    expect(verdict.isAccepted).toBe(false);
  });

  it('accepts dont_know with no sources', () => {
    expect(evaluateAnswerContract(answer({ category: 'dont_know' }), sources)).toEqual({ isAccepted: true });
  });

  it('rejects unknown source IDs in any category', () => {
    const verdict = evaluateAnswerContract(answer({ category: 'conversational', sourceIds: ['src_99'] }), sources);
    expect(verdict.isAccepted).toBe(false);
  });

  it('rejects empty answer text', () => {
    expect(evaluateAnswerContract(answer({ category: 'dont_know', text: '   ' }), sources)).toEqual({
      isAccepted: false,
      reason: 'The answer text is empty.',
    });
  });
});

describe('containsVerbatim', () => {
  it('normalizes whitespace on both sides', () => {
    expect(containsVerbatim('a  b\n c', 'a b c')).toBe(true);
  });

  it('never matches an empty quote', () => {
    expect(containsVerbatim('anything', '   ')).toBe(false);
  });
});
