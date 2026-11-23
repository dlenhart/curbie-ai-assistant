import { OcrFailedError } from '../../core/recipes/errors/ocr-failed.error';
import type { RecognizedLine } from '../../core/recipes/interfaces/recognized-line.interface';

export function parseOcrOutput(stdout: string): readonly RecognizedLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new OcrFailedError('The OCR helper printed output that is not JSON.');
  }
  const lines = (parsed as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(lines)) {
    throw new OcrFailedError('The OCR helper output has no "lines" list.');
  }
  return lines.map(toRecognizedLine);
}

function toRecognizedLine(candidate: unknown): RecognizedLine {
  const { text, confidence } = (candidate ?? {}) as { text?: unknown; confidence?: unknown };
  if (typeof text !== 'string') {
    throw new OcrFailedError('An OCR line has no text.');
  }
  if (typeof confidence !== 'number' || !(confidence >= 0 && confidence <= 1)) {
    throw new OcrFailedError('An OCR line has a confidence outside 0 to 1.');
  }
  return { text, confidence };
}
