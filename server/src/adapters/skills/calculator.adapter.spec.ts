import { CalculatorAdapter } from './calculator.adapter';
import { CalculatorError } from './errors/calculator.error';

describe('CalculatorAdapter', () => {
  const calculator = new CalculatorAdapter();

  function evaluate(expression: unknown) {
    return calculator.execute('evaluate_expression', { expression });
  }

  it.each([
    ['0.15 * 340', '0.15 * 340 = 51'],
    ['0.1 + 0.2', '0.1 + 0.2 = 0.3'],
    ['3/8 inch to mm', '3/8 inch to mm = 9.525 mm'],
    ['2^10', '2^10 = 1024'],
  ])('evaluates %s', async (expression, expected) => {
    await expect(evaluate(expression)).resolves.toEqual({ title: 'Calculator', content: expected, requiresQuote: false });
  });

  it.each([
    ['import({}, {override: true})'],
    ['createUnit("furlong2", "1 m")'],
    ['evaluate("1 + 1")'],
    ['parse("1 + 1")'],
    ['zeros(100000, 100000)'],
    ['ones(100000, 100000)'],
    ['range(1, 1e9)'],
  ])('refuses the dangerous expression %s', async (expression) => {
    await expect(evaluate(expression)).rejects.toThrow(CalculatorError);
  });

  it('refuses empty and non-string expressions', async () => {
    await expect(evaluate('   ')).rejects.toThrow(CalculatorError);
    await expect(evaluate(42)).rejects.toThrow(CalculatorError);
  });

  it('refuses overly long expressions', async () => {
    await expect(evaluate('1+'.repeat(200) + '1')).rejects.toThrow(/longer than 300/);
  });

  it('reports syntax errors with the original expression', async () => {
    await expect(evaluate('2 +* 3')).rejects.toThrow(/Could not evaluate "2 \+\* 3"/);
  });

  it('refuses expressions that do not produce a value', async () => {
    await expect(evaluate('sin')).rejects.toThrow(/did not produce a value/);
  });

  it('refuses unknown tool names', async () => {
    await expect(calculator.execute('format_disk', {})).rejects.toThrow(/no tool named "format_disk"/);
  });
});
