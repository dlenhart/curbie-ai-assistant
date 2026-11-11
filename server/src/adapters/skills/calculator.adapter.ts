import { all, create } from 'mathjs';
import { DISABLED_CALCULATOR_FUNCTIONS, MAX_CALCULATOR_EXPRESSION_LENGTH } from '../../constants';
import type { SkillAdapter } from '../../core/skills/interfaces/skill-adapter.interface';
import type { ToolResult } from '../../core/skills/interfaces/tool-result.interface';
import { CalculatorError } from './errors/calculator.error';

export class CalculatorAdapter implements SkillAdapter {
  readonly name = 'calculator';
  private readonly evaluateLimited: (expression: string) => unknown;
  private readonly formatValue: (value: unknown) => string;

  constructor() {
    const math = create(all);
    const evaluateLimited = math.evaluate;
    const disabledReplacements = Object.fromEntries(
      DISABLED_CALCULATOR_FUNCTIONS.map((functionName) => [
        functionName,
        () => {
          throw new Error(`Function ${functionName} is disabled`);
        },
      ]),
    );
    math.import(disabledReplacements, { override: true });
    this.evaluateLimited = (expression) => evaluateLimited(expression);
    this.formatValue = (value) => math.format(value, { precision: 14 });
  }

  async execute(toolName: string, toolArguments: Record<string, unknown>): Promise<ToolResult> {
    if (toolName !== 'evaluate_expression') {
      throw new CalculatorError(`Calculator has no tool named "${toolName}".`);
    }
    const expression = toolArguments.expression;
    if (typeof expression !== 'string' || expression.trim() === '') {
      throw new CalculatorError('The expression must be a non-empty string.');
    }
    if (expression.length > MAX_CALCULATOR_EXPRESSION_LENGTH) {
      throw new CalculatorError(`The expression is longer than ${MAX_CALCULATOR_EXPRESSION_LENGTH} characters.`);
    }

    let value: unknown;
    try {
      value = this.evaluateLimited(expression);
    } catch (error) {
      throw new CalculatorError(`Could not evaluate "${expression}": ${(error as Error).message}`);
    }
    if (value === undefined || typeof value === 'function') {
      throw new CalculatorError(`"${expression}" did not produce a value.`);
    }
    return { title: 'Calculator', content: `${expression} = ${this.formatValue(value)}`, requiresQuote: false };
  }
}
