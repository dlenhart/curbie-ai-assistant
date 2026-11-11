import type { FetchFunction } from '../types/fetch-function.type';

export interface OllamaModelAdapterOptions {
  readonly baseUrl: string;
  readonly modelName: string;
  readonly fetchFunction: FetchFunction;
  readonly timeoutMilliseconds?: number;
}
