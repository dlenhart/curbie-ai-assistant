import type { RecognizedLine } from './recognized-line.interface';

export interface OcrPort {
  recognize(imagePath: string, displayCopyPath: string): Promise<readonly RecognizedLine[]>;
}
