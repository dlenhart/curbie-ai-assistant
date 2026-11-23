import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { OcrPort } from '../../../core/recipes/interfaces/ocr-port.interface';
import type { RecognizedLine } from '../../../core/recipes/interfaces/recognized-line.interface';

export class ScriptedOcrInvoker implements OcrPort {
  constructor(private readonly responses: Map<string, readonly RecognizedLine[] | Error>) {}

  async recognize(imagePath: string, displayCopyPath: string): Promise<readonly RecognizedLine[]> {
    writeFileSync(displayCopyPath, Buffer.from([0xff, 0xd8, 0xff]));
    const response = this.responses.get(basename(imagePath));
    if (response === undefined) {
      throw new Error(`No scripted OCR response for ${basename(imagePath)}.`);
    }
    if (response instanceof Error) {
      throw response;
    }
    return response;
  }
}
