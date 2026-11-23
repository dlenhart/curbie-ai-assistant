import type { FetchFunction } from '../types/fetch-function.type';
import type { GetFunction } from '../types/get-function.type';

export interface OllamaModelLoaderOptions {
  readonly baseUrl: string;
  readonly getFunction: GetFunction;
  readonly postFunction: FetchFunction;
  readonly statusTimeoutMilliseconds?: number;
  readonly loadTimeoutMilliseconds?: number;
}
