import Ajv from 'ajv';
import { STRUCTURED_ANSWER_SCHEMA } from '../../constants';
import { MalformedAnswerError } from './errors/malformed-answer.error';
import type { StructuredAnswer } from './interfaces/structured-answer.interface';

const validateStructuredAnswer = new Ajv({ allErrors: true, strict: true }).compile<StructuredAnswer>(
  STRUCTURED_ANSWER_SCHEMA,
);

export function parseStructuredAnswer(raw: string): StructuredAnswer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MalformedAnswerError('The answer was not valid JSON.');
  }
  if (!validateStructuredAnswer(parsed)) {
    const details = (validateStructuredAnswer.errors ?? [])
      .map((error) => `${error.instancePath || 'answer'} ${error.message}`)
      .join('; ');
    throw new MalformedAnswerError(`The answer did not match the required shape: ${details}.`);
  }
  return parsed;
}
