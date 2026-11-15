import { parseConfig } from './curbie-config.parser';
import { InvalidConfigurationError } from './errors/invalid-configuration.error';

const DEFAULTS = { skillsDirectory: '/repo/skills' };

describe('parseConfig', () => {
  it('requires CURBIE_DATA_DIR', () => {
    expect(() => parseConfig({}, DEFAULTS)).toThrow(InvalidConfigurationError);
    expect(() => parseConfig({}, DEFAULTS)).toThrow(/CURBIE_DATA_DIR/);
  });

  it('applies defaults for everything optional', () => {
    expect(parseConfig({ CURBIE_DATA_DIR: '/Volumes/Curbie/data' }, DEFAULTS)).toEqual({
      dataDirectory: '/Volumes/Curbie/data',
      skillsDirectory: '/repo/skills',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      modelName: 'qwen3:4b-instruct',
      httpHost: '127.0.0.1',
      httpPort: 3000,
      historyMessageLimit: 10,
      maxToolRounds: 4,
    });
  });

  it('reads overrides and strips trailing slashes from the Ollama URL', () => {
    const config = parseConfig(
      {
        CURBIE_DATA_DIR: '/data',
        CURBIE_SKILLS_DIR: '/elsewhere/skills',
        OLLAMA_BASE_URL: 'http://127.0.0.1:9999/',
        CURBIE_MODEL: 'qwen2.5:7b',
        CURBIE_HTTP_HOST: 'localhost',
        CURBIE_HTTP_PORT: '8080',
        CURBIE_HISTORY_MESSAGE_LIMIT: '0',
        CURBIE_MAX_TOOL_ROUNDS: '2',
      },
      DEFAULTS,
    );
    expect(config.skillsDirectory).toBe('/elsewhere/skills');
    expect(config.ollamaBaseUrl).toBe('http://127.0.0.1:9999');
    expect(config.modelName).toBe('qwen2.5:7b');
    expect(config.httpHost).toBe('localhost');
    expect(config.httpPort).toBe(8080);
    expect(config.historyMessageLimit).toBe(0);
    expect(config.maxToolRounds).toBe(2);
  });

  it.each(['0.0.0.0', '192.168.1.20', '::', '::1', 'localhost', '127.0.0.1'])('accepts %s as the HTTP host', (host) => {
    expect(parseConfig({ CURBIE_DATA_DIR: '/data', CURBIE_HTTP_HOST: host }, DEFAULTS).httpHost).toBe(host);
  });

  it.each(['curbie.local', 'example.com', '192.168.1', 'http://0.0.0.0'])('rejects %s as the HTTP host', (host) => {
    expect(() => parseConfig({ CURBIE_DATA_DIR: '/data', CURBIE_HTTP_HOST: host }, DEFAULTS)).toThrow(
      /CURBIE_HTTP_HOST must be an IP address \(such as 0\.0\.0\.0 for the home network\) or localhost/,
    );
  });

  it('still defaults to loopback so LAN access is opt-in', () => {
    expect(parseConfig({ CURBIE_DATA_DIR: '/data' }, DEFAULTS).httpHost).toBe('127.0.0.1');
  });

  it.each([['abc'], ['0'], ['70000'], ['-1'], ['3.5']])('rejects invalid port %s', (port) => {
    expect(() => parseConfig({ CURBIE_DATA_DIR: '/data', CURBIE_HTTP_PORT: port }, DEFAULTS)).toThrow(
      /CURBIE_HTTP_PORT/,
    );
  });

  it('rejects out-of-range tool rounds', () => {
    expect(() => parseConfig({ CURBIE_DATA_DIR: '/data', CURBIE_MAX_TOOL_ROUNDS: '0' }, DEFAULTS)).toThrow(
      /CURBIE_MAX_TOOL_ROUNDS/,
    );
  });
});
