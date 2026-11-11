export interface CurbieConfig {
  readonly dataDirectory: string;
  readonly skillsDirectory: string;
  readonly ollamaBaseUrl: string;
  readonly modelName: string;
  readonly httpHost: string;
  readonly httpPort: number;
  readonly historyMessageLimit: number;
  readonly maxToolRounds: number;
}
