import type { ServerResponse } from 'node:http';

export interface RenderingResponse extends ServerResponse {
  status(code: number): RenderingResponse;
  render(view: string, locals: object): void;
}
