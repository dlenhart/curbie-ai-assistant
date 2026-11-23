import { OcrFailedError } from '../../core/recipes/errors/ocr-failed.error';
import { parseOcrOutput } from './ocr-output.parser';

describe('parseOcrOutput', () => {
  it('parses lines', () => {
    const stdout = JSON.stringify({ lines: [{ text: '2 cups flour', confidence: 0.9 }, { text: 'Mix', confidence: 0.4 }] });
    expect(parseOcrOutput(stdout)).toEqual([
      { text: '2 cups flour', confidence: 0.9 },
      { text: 'Mix', confidence: 0.4 },
    ]);
  });

  it('parses an empty list of lines', () => {
    expect(parseOcrOutput('{"lines":[]}')).toEqual([]);
  });

  it.each([
    ['non-JSON', 'not json'],
    ['missing lines', '{"rows":[]}'],
    ['a confidence above 1', '{"lines":[{"text":"a","confidence":1.5}]}'],
    ['a non-string text', '{"lines":[{"text":5,"confidence":0.5}]}'],
  ])('rejects %s', (_label, stdout) => {
    expect(() => parseOcrOutput(stdout)).toThrow(OcrFailedError);
  });
});
