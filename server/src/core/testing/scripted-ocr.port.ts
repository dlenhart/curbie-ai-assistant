import type { OcrPort } from '../recipes/interfaces/ocr-port.interface';
import type { RecognizedLine } from '../recipes/interfaces/recognized-line.interface';

export class ScriptedOcrPort implements OcrPort {
  readonly receivedCalls: Array<{ imagePath: string; displayCopyPath: string }> = [];

  constructor(private readonly responsesByBaseName: ReadonlyMap<string, readonly RecognizedLine[] | Error>) {}

  async recognize(imagePath: string, displayCopyPath: string): Promise<readonly RecognizedLine[]> {
    this.receivedCalls.push({ imagePath, displayCopyPath });
    const baseName = imagePath.slice(imagePath.lastIndexOf('/') + 1);
    const response = this.responsesByBaseName.get(baseName);
    if (response === undefined) throw new Error(`No scripted OCR response for ${baseName}.`);
    if (response instanceof Error) throw response;
    return response;
  }
}
