export interface OcrLine {
  readonly text: string;
  readonly confidence: number;
  readonly pageNumber: number;
}
