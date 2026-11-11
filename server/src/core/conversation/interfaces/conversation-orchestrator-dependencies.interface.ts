import type { ModelPort } from '../../model/interfaces/model-port.interface';
import type { Clock } from '../../shared/interfaces/clock.interface';
import type { IdGenerator } from '../../shared/interfaces/id-generator.interface';
import type { ToolRegistry } from '../../skills/tool.registry';
import type { TranscriptRepository } from './transcript-repository.interface';

export interface ConversationOrchestratorDependencies {
  readonly model: ModelPort;
  readonly toolRegistry: ToolRegistry;
  readonly transcripts: TranscriptRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly systemPrompt: string;
  readonly historyMessageLimit: number;
  readonly maxToolRounds: number;
}
