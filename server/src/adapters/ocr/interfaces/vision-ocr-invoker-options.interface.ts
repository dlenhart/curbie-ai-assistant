import type { ProcessRunner } from '../types/process-runner.type';

export interface VisionOcrInvokerOptions {
  readonly binaryPath: string;
  readonly dataDirectory: string;
  readonly runProcess?: ProcessRunner;
}
