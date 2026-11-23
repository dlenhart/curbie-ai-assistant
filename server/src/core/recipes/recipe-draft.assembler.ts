import {
  RECIPE_LEADING_BULLET_PATTERN,
  RECIPE_LEADING_STEP_NUMBER_PATTERN,
  RECIPE_SENTENCE_END_PATTERN,
  RECIPE_SERVINGS_EXTRACT_PATTERN,
} from '../../constants';
import type { LineLabels } from './interfaces/line-labels.interface';
import type { OcrLine } from './interfaces/ocr-line.interface';
import type { RecipeLineKind } from './types/recipe-line-kind.type';

export function assembleRecipeDraft(
  lines: readonly OcrLine[],
  labels: LineLabels | null,
  fallbackTitle: string,
): string {
  if (labels === null) {
    return joinBlocks([
      [`# ${fallbackTitle}`],
      ['## Ingredients'],
      ['## Steps'],
      ['## Unsorted', ...lines.map((line) => line.text)],
    ]);
  }
  const textOf = (lineNumber: number): string => {
    if (lineNumber < 1 || lineNumber > lines.length) {
      throw new RangeError(`Line ${lineNumber} is outside 1 to ${lines.length}.`);
    }
    return lines[lineNumber - 1].text;
  };
  const headingNumbers = new Set(labels.headings);
  const blockKindByLineNumber = placeLinesInBlocks(labels);
  const entryNumbersFor = (kind: RecipeLineKind): number[] =>
    [...blockKindByLineNumber.entries()]
      .filter(([, blockKind]) => blockKind === kind)
      .map(([lineNumber]) => lineNumber)
      .sort((first, second) => first - second);
  const headingTextOf = (lineNumber: number): string => `### ${textOf(lineNumber)}`;

  const titleBlock = buildTitleBlock(labels, textOf, fallbackTitle);
  const ingredientBlock = buildIngredientBlock(entryNumbersFor('ingredients'), headingNumbers, textOf, headingTextOf);
  const stepBlock = buildStepBlock(entryNumbersFor('steps'), headingNumbers, textOf, headingTextOf);

  const placedLineNumbers = new Set<number>([...blockKindByLineNumber.keys(), ...labels.title]);
  const unsortedLines = lines.filter((_, index) => !placedLineNumbers.has(index + 1)).map((line) => line.text);
  const blocks = [titleBlock, ingredientBlock, stepBlock];
  if (unsortedLines.length > 0) blocks.push(['## Unsorted', ...unsortedLines]);
  return joinBlocks(blocks);
}

function placeLinesInBlocks(labels: LineLabels): Map<number, RecipeLineKind> {
  const itemKindByLineNumber = new Map<number, RecipeLineKind>([
    ...labels.ingredients.map((lineNumber): [number, RecipeLineKind] => [lineNumber, 'ingredients']),
    ...labels.steps.map((lineNumber): [number, RecipeLineKind] => [lineNumber, 'steps']),
  ]);
  const itemNumbersInOrder = [...itemKindByLineNumber.keys()].sort((first, second) => first - second);
  const placed = new Map(itemKindByLineNumber);
  for (const headingNumber of labels.headings) {
    const nextItemNumber = itemNumbersInOrder.find((itemNumber) => itemNumber > headingNumber);
    if (nextItemNumber === undefined) continue;
    placed.set(headingNumber, itemKindByLineNumber.get(nextItemNumber) as RecipeLineKind);
  }
  return placed;
}

function buildTitleBlock(
  labels: LineLabels,
  textOf: (lineNumber: number) => string,
  fallbackTitle: string,
): string[] {
  const title = labels.title.length === 0 ? fallbackTitle : labels.title.map(textOf).join(' ');
  const servingsMatch = labels.servings === null ? null : RECIPE_SERVINGS_EXTRACT_PATTERN.exec(textOf(labels.servings));
  if (servingsMatch === null) return [`# ${title}`];
  return [`# ${title}`, `Serves: ${servingsMatch[0]}`];
}

function buildIngredientBlock(
  entryNumbers: readonly number[],
  headingNumbers: ReadonlySet<number>,
  textOf: (lineNumber: number) => string,
  headingTextOf: (lineNumber: number) => string,
): string[] {
  const block = ['## Ingredients'];
  for (const lineNumber of entryNumbers) {
    if (headingNumbers.has(lineNumber)) {
      block.push(headingTextOf(lineNumber));
      continue;
    }
    block.push(`- ${textOf(lineNumber).replace(RECIPE_LEADING_BULLET_PATTERN, '')}`);
  }
  return block;
}

function buildStepBlock(
  entryNumbers: readonly number[],
  headingNumbers: ReadonlySet<number>,
  textOf: (lineNumber: number) => string,
  headingTextOf: (lineNumber: number) => string,
): string[] {
  const block = ['## Steps'];
  let stepsInSection: string[] = [];
  const flushSection = (): void => {
    stepsInSection.forEach((step, index) => block.push(`${index + 1}. ${step}`));
    stepsInSection = [];
  };
  for (const lineNumber of entryNumbers) {
    if (headingNumbers.has(lineNumber)) {
      flushSection();
      block.push(headingTextOf(lineNumber));
      continue;
    }
    stepsInSection = addStepLine(stepsInSection, textOf(lineNumber));
  }
  flushSection();
  return block;
}

function addStepLine(stepsInSection: readonly string[], lineText: string): string[] {
  const previousStep = stepsInSection[stepsInSection.length - 1];
  const isNewStep =
    previousStep === undefined ||
    RECIPE_LEADING_STEP_NUMBER_PATTERN.test(lineText) ||
    RECIPE_SENTENCE_END_PATTERN.test(previousStep);
  if (isNewStep) return [...stepsInSection, lineText.replace(RECIPE_LEADING_STEP_NUMBER_PATTERN, '')];
  return [...stepsInSection.slice(0, -1), `${previousStep.trim()} ${lineText.trim()}`];
}

function joinBlocks(blocks: readonly (readonly string[])[]): string {
  return `${blocks.map((block) => block.join('\n')).join('\n\n')}\n`;
}
