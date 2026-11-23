import Ajv from 'ajv';
import { RECIPE_LINE_LABELS_SCHEMA } from '../../constants';
import { InvalidLineLabelsError } from './errors/invalid-line-labels.error';
import type { LineLabels } from './interfaces/line-labels.interface';

const validateLabelShape = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true }).compile<LineLabels>(
  RECIPE_LINE_LABELS_SCHEMA,
);

export function validateLineLabels(raw: unknown, lineCount: number): LineLabels {
  if (!validateLabelShape(raw)) {
    const details = (validateLabelShape.errors ?? [])
      .map((error) => `${error.instancePath || 'labels'} ${error.message}`)
      .join('; ');
    throw new InvalidLineLabelsError(`the labels did not match the required shape: ${details}`);
  }
  const everyNumber = [
    ...raw.title,
    ...(raw.servings === null ? [] : [raw.servings]),
    ...raw.headings,
    ...raw.ingredients,
    ...raw.steps,
  ];
  const outOfRange = everyNumber.find((lineNumber) => lineNumber < 1 || lineNumber > lineCount);
  if (outOfRange !== undefined) {
    throw new InvalidLineLabelsError(`line ${outOfRange} is outside 1 to ${lineCount}`);
  }
  const duplicate = everyNumber.find((lineNumber, index) => everyNumber.indexOf(lineNumber) !== index);
  if (duplicate !== undefined) {
    throw new InvalidLineLabelsError(`line ${duplicate} is in more than one list`);
  }
  if (raw.ingredients.length === 0) throw new InvalidLineLabelsError('there are no ingredient lines');
  if (raw.steps.length === 0) throw new InvalidLineLabelsError('there are no step lines');
  return raw;
}
