import { execFile } from 'node:child_process';
import { accessSync, constants as fileConstants, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { OCR_MAX_OUTPUT_BYTES, OCR_TIMEOUT_MILLISECONDS } from '../../constants';
import { OcrFailedError } from '../../core/recipes/errors/ocr-failed.error';
import { OcrUnavailableError } from '../../core/recipes/errors/ocr-unavailable.error';
import type { OcrPort } from '../../core/recipes/interfaces/ocr-port.interface';
import type { RecognizedLine } from '../../core/recipes/interfaces/recognized-line.interface';
import type { VisionOcrInvokerOptions } from './interfaces/vision-ocr-invoker-options.interface';
import { parseOcrOutput } from './ocr-output.parser';
import type { ProcessRunner } from './types/process-runner.type';

export class VisionOcrInvoker implements OcrPort {
  private readonly runProcess: ProcessRunner;

  constructor(private readonly options: VisionOcrInvokerOptions) {
    this.runProcess = options.runProcess ?? (promisify(execFile) as unknown as ProcessRunner);
  }

  async recognize(imagePath: string, displayCopyPath: string): Promise<readonly RecognizedLine[]> {
    this.assertInsideDataDirectory(imagePath);
    this.assertInsideDataDirectory(dirname(displayCopyPath));
    this.assertBinaryIsExecutable();
    const stdout = await this.runHelper(imagePath, displayCopyPath);
    return parseOcrOutput(stdout);
  }

  private assertInsideDataDirectory(path: string): void {
    const realRoot = realpathSync(this.options.dataDirectory);
    let realPath: string;
    try {
      realPath = realpathSync(path);
    } catch {
      throw new OcrFailedError(`"${path}" cannot be read.`);
    }
    const relation = relative(realRoot, realPath);
    const isOutside = relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation);
    if (isOutside) {
      throw new OcrFailedError(`"${path}" is outside the data directory.`);
    }
  }

  private assertBinaryIsExecutable(): void {
    try {
      accessSync(this.options.binaryPath, fileConstants.X_OK);
    } catch {
      throw new OcrUnavailableError(`The OCR helper is missing or not executable at ${this.options.binaryPath}.`);
    }
  }

  private async runHelper(imagePath: string, displayCopyPath: string): Promise<string> {
    try {
      const { stdout } = await this.runProcess(this.options.binaryPath, [imagePath, displayCopyPath], {
        timeout: OCR_TIMEOUT_MILLISECONDS,
        maxBuffer: OCR_MAX_OUTPUT_BYTES,
      });
      return stdout;
    } catch (error) {
      throw new OcrFailedError(`The OCR helper failed: ${(error as Error).message}`);
    }
  }
}
