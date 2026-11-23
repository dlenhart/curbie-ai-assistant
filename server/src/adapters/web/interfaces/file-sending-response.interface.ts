import type { ServerResponse } from 'node:http';

export interface FileSendingResponse extends ServerResponse {
  sendFile(absolutePath: string, options: object, callback: (error?: Error) => void): void;
}
