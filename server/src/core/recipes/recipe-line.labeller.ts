import {
  MAX_RECIPE_LABELLING_ATTEMPTS,
  RECIPE_LABELLING_INSTRUCTIONS,
  RECIPE_LINE_LABELS_SCHEMA,
  RECIPE_OCR_UNTRUSTED_NOTICE,
} from '../../constants';
import type { ModelPort } from '../model/interfaces/model-port.interface';
import type { ChatMessage } from '../model/types/chat-message.type';
import { InvalidLineLabelsError } from './errors/invalid-line-labels.error';
import type { LineLabels } from './interfaces/line-labels.interface';
import type { OcrLine } from './interfaces/ocr-line.interface';
import { validateLineLabels } from './line-labels.validator';

export class RecipeLineLabeller {
  constructor(private readonly model: ModelPort) {}

  async label(lines: readonly OcrLine[], modelName: string): Promise<LineLabels | null> {
    const messages: ChatMessage[] = [
      { role: 'system', content: RECIPE_LABELLING_INSTRUCTIONS.join('\n') },
      { role: 'user', content: this.buildOcrBlock(lines) },
    ];
    for (let attempt = 1; attempt <= MAX_RECIPE_LABELLING_ATTEMPTS; attempt += 1) {
      const response = await this.model.chat({
        modelName,
        tools: [],
        responseSchema: RECIPE_LINE_LABELS_SCHEMA,
        messages: [...messages],
      });
      try {
        return validateLineLabels(JSON.parse(response.content), lines.length);
      } catch (error) {
        const reason = this.rejectionReason(error);
        messages.push(
          { role: 'assistant', content: response.content, toolCalls: [] },
          { role: 'system', content: `Rejected: ${reason}. Answer again with valid line numbers.` },
        );
      }
    }
    return null;
  }

  private buildOcrBlock(lines: readonly OcrLine[]): string {
    const numbered = lines.map((line, index) => `${index + 1}: ${line.text}`);
    return ['<ocr>', RECIPE_OCR_UNTRUSTED_NOTICE, ...numbered, '</ocr>'].join('\n');
  }

  private rejectionReason(error: unknown): string {
    if (error instanceof InvalidLineLabelsError) return error.reason;
    if (error instanceof SyntaxError) return 'the reply was not valid JSON';
    throw error;
  }
}
