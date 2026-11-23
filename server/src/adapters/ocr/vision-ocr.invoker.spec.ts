import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OcrFailedError } from '../../core/recipes/errors/ocr-failed.error';
import { OcrUnavailableError } from '../../core/recipes/errors/ocr-unavailable.error';
import type { ProcessRunner } from './types/process-runner.type';
import { VisionOcrInvoker } from './vision-ocr.invoker';

describe('VisionOcrInvoker', () => {
  let root: string;
  let dataDirectory: string;
  let binaryPath: string;
  let calls: Array<{ file: string; args: readonly string[]; options: { timeout: number; maxBuffer: number } }>;

  const successfulRunner: ProcessRunner = async (file, args, options) => {
    calls.push({ file, args, options });
    return { stdout: '{"lines":[{"text":"Flour","confidence":0.8}]}' };
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'curbie-ocr-'));
    dataDirectory = join(root, 'data');
    mkdirSync(join(dataDirectory, 'work'), { recursive: true });
    writeFileSync(join(dataDirectory, 'work', 'photo.jpg'), 'x');
    binaryPath = join(root, 'curbie-ocr');
    writeFileSync(binaryPath, '#!/bin/sh\n');
    chmodSync(binaryPath, 0o755);
    calls = [];
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('passes the fixed binary and an argument array of the two paths', async () => {
    const invoker = new VisionOcrInvoker({ binaryPath, dataDirectory, runProcess: successfulRunner });
    const imagePath = join(dataDirectory, 'work', 'photo.jpg');
    const displayCopyPath = join(dataDirectory, 'work', 'photo.display.jpg');

    const lines = await invoker.recognize(imagePath, displayCopyPath);

    expect(lines).toEqual([{ text: 'Flour', confidence: 0.8 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe(binaryPath);
    expect(calls[0].args).toEqual([imagePath, displayCopyPath]);
    expect(calls[0].options).toEqual({ timeout: 60_000, maxBuffer: 4_000_000 });
  });

  it('refuses an image outside the data dir, including through a symlink, without running anything', async () => {
    const outside = join(root, 'outside.jpg');
    writeFileSync(outside, 'x');
    const link = join(dataDirectory, 'work', 'link.jpg');
    symlinkSync(outside, link);
    const invoker = new VisionOcrInvoker({ binaryPath, dataDirectory, runProcess: successfulRunner });
    const displayCopyPath = join(dataDirectory, 'work', 'out.display.jpg');

    await expect(invoker.recognize(outside, displayCopyPath)).rejects.toThrow(OcrFailedError);
    await expect(invoker.recognize(link, displayCopyPath)).rejects.toThrow(OcrFailedError);
    expect(calls).toEqual([]);
  });

  it('refuses a display copy path outside the data dir', async () => {
    const invoker = new VisionOcrInvoker({ binaryPath, dataDirectory, runProcess: successfulRunner });

    await expect(
      invoker.recognize(join(dataDirectory, 'work', 'photo.jpg'), join(root, 'escape.display.jpg')),
    ).rejects.toThrow(OcrFailedError);
    expect(calls).toEqual([]);
  });

  it('throws OcrUnavailableError when the binary is missing', async () => {
    const invoker = new VisionOcrInvoker({
      binaryPath: join(root, 'missing'),
      dataDirectory,
      runProcess: successfulRunner,
    });

    await expect(
      invoker.recognize(join(dataDirectory, 'work', 'photo.jpg'), join(dataDirectory, 'work', 'a.display.jpg')),
    ).rejects.toThrow(OcrUnavailableError);
    expect(calls).toEqual([]);
  });

  it('wraps a runner rejection (timeout or exit 1) as OcrFailedError', async () => {
    const failing: ProcessRunner = async () => {
      throw new Error('Command failed: exit 1');
    };
    const invoker = new VisionOcrInvoker({ binaryPath, dataDirectory, runProcess: failing });

    await expect(
      invoker.recognize(join(dataDirectory, 'work', 'photo.jpg'), join(dataDirectory, 'work', 'a.display.jpg')),
    ).rejects.toThrow(OcrFailedError);
  });

  it('wraps unparseable output as OcrFailedError', async () => {
    const garbage: ProcessRunner = async () => ({ stdout: 'oops' });
    const invoker = new VisionOcrInvoker({ binaryPath, dataDirectory, runProcess: garbage });

    await expect(
      invoker.recognize(join(dataDirectory, 'work', 'photo.jpg'), join(dataDirectory, 'work', 'a.display.jpg')),
    ).rejects.toThrow(OcrFailedError);
  });
});
