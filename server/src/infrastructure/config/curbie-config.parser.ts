import { resolve } from 'node:path';
import { LOOPBACK_HOSTS } from '../../constants';
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

  const httpHost = readSetting(environment, 'CURBIE_HTTP_HOST') ?? '127.0.0.1';
  if (!LOOPBACK_HOSTS.has(httpHost)) {
    throw new InvalidConfigurationError(
      `CURBIE_HTTP_HOST "${httpHost}" is not a loopback address. LAN access stays disabled until authentication and TLS exist (Phase 2).`,
    );
  }

  return {
    dataDirectory,
    skillsDirectory: resolve(readSetting(environment, 'CURBIE_SKILLS_DIR') ?? defaults.skillsDirectory),
    ollamaBaseUrl: (readSetting(environment, 'OLLAMA_BASE_URL') ?? 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    modelName: readSetting(environment, 'CURBIE_MODEL') ?? 'qwen3:4b',
    httpHost,
    httpPort: readIntegerSetting(environment, 'CURBIE_HTTP_PORT', { defaultValue: 3000, minimum: 1, maximum: 65535 }),
    historyMessageLimit: readIntegerSetting(environment, 'CURBIE_HISTORY_MESSAGE_LIMIT', {
      defaultValue: 10,
      minimum: 0,
      maximum: 100,
    }),
    maxToolRounds: readIntegerSetting(environment, 'CURBIE_MAX_TOOL_ROUNDS', { defaultValue: 4, minimum: 1, maximum: 10 }),
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
