import type { GetFunction } from '../types/get-function.type';

export interface OllamaModelCatalogAdapterOptions {
  readonly baseUrl: string;
  readonly fetchFunction: GetFunction;
  readonly timeoutMilliseconds?: number;
}
