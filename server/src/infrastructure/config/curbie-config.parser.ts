import { isIP } from 'node:net';
import { resolve } from 'node:path';
import {
  DEFAULT_HISTORY_MESSAGE_LIMIT,
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  DEFAULT_MAX_TOOL_ROUNDS,
  DEFAULT_MODEL_NAME,
  DEFAULT_OLLAMA_BASE_URL,
  MAX_HISTORY_MESSAGE_LIMIT,
  MAX_TOOL_ROUNDS_LIMIT,
} from '../../constants';
import { InvalidConfigurationError } from './errors/invalid-configuration.error';
import type { CurbieConfig } from './interfaces/curbie-config.interface';
import type { Environment } from './types/environment.type';

export function parseConfig(environment: Environment, defaults: { readonly skillsDirectory: string }): CurbieConfig {
  const dataDirectory = readSetting(environment, 'CURBIE_DATA_DIR');
  if (dataDirectory === undefined) {
    throw new InvalidConfigurationError(
      "CURBIE_DATA_DIR is required: the absolute path to Curbie's data directory (on the USB drive).",
    );
  }

  const httpHost = readSetting(environment, 'CURBIE_HTTP_HOST') ?? DEFAULT_HTTP_HOST;
  if (httpHost !== 'localhost' && isIP(httpHost) === 0) {
    throw new InvalidConfigurationError(
      `CURBIE_HTTP_HOST must be an IP address (such as 0.0.0.0 for the home network) or localhost; got "${httpHost}".`,
    );
  }

  return {
    dataDirectory,
    skillsDirectory: resolve(readSetting(environment, 'CURBIE_SKILLS_DIR') ?? defaults.skillsDirectory),
    ollamaBaseUrl: (readSetting(environment, 'OLLAMA_BASE_URL') ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, ''),
    modelName: readSetting(environment, 'CURBIE_MODEL') ?? DEFAULT_MODEL_NAME,
    httpHost,
    httpPort: readIntegerSetting(environment, 'CURBIE_HTTP_PORT', {
      defaultValue: DEFAULT_HTTP_PORT,
      minimum: 1,
      maximum: 65535,
    }),
    historyMessageLimit: readIntegerSetting(environment, 'CURBIE_HISTORY_MESSAGE_LIMIT', {
      defaultValue: DEFAULT_HISTORY_MESSAGE_LIMIT,
      minimum: 0,
      maximum: MAX_HISTORY_MESSAGE_LIMIT,
    }),
    maxToolRounds: readIntegerSetting(environment, 'CURBIE_MAX_TOOL_ROUNDS', {
      defaultValue: DEFAULT_MAX_TOOL_ROUNDS,
      minimum: 1,
      maximum: MAX_TOOL_ROUNDS_LIMIT,
    }),
  };
}

function readSetting(environment: Environment, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function readIntegerSetting(
  environment: Environment,
  name: string,
  bounds: { readonly defaultValue: number; readonly minimum: number; readonly maximum: number },
): number {
  const raw = readSetting(environment, name);
  if (raw === undefined) return bounds.defaultValue;
  if (!/^\d+$/.test(raw)) {
    throw new InvalidConfigurationError(`${name} must be a whole number; got "${raw}".`);
  }
  const value = Number(raw);
  if (value < bounds.minimum || value > bounds.maximum) {
    throw new InvalidConfigurationError(`${name} must be between ${bounds.minimum} and ${bounds.maximum}; got ${value}.`);
  }
  return value;
}
