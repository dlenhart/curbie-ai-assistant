import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import type Database from 'better-sqlite3';
import { OllamaModelAdapter } from './adapters/model/ollama-model.adapter';
import { DatabaseLifecycle } from './adapters/persistence/database.lifecycle';
import { openDatabase } from './adapters/persistence/database.factory';
import { SqliteTranscriptRepository } from './adapters/persistence/sqlite-transcript.repository';
import { createSkillAdapters } from './adapters/skills/skill-adapters.factory';
import { loadSkillDocuments } from './adapters/skills/skill-directory.loader';
import { RandomIdGenerator } from './adapters/system/random-id.generator';
import { SystemClock } from './adapters/system/system.clock';
import { ChatPageController } from './adapters/web/chat-page.controller';
import { ChatGateway } from './adapters/web/chat.gateway';
import {
  CLOCK,
  CONFIG,
  DATABASE,
  GENERATION_QUEUE,
  ID_GENERATOR,
  MODEL,
  ORCHESTRATOR,
  TOOL_REGISTRY,
  TRANSCRIPTS,
} from './constants';
import { ConversationOrchestrator } from './core/conversation/conversation.orchestrator';
import type { TranscriptRepository } from './core/conversation/interfaces/transcript-repository.interface';
import { buildSystemPrompt } from './core/conversation/system-prompt.builder';
import type { ModelPort } from './core/model/interfaces/model-port.interface';
import type { Clock } from './core/shared/interfaces/clock.interface';
import type { IdGenerator } from './core/shared/interfaces/id-generator.interface';
import { SerialTaskQueue } from './core/shared/serial-task.queue';
import { buildToolRegistry } from './core/skills/tool-registry.factory';
import type { ToolRegistry } from './core/skills/tool.registry';
import { parseConfig } from './infrastructure/config/curbie-config.parser';
import type { CurbieConfig } from './infrastructure/config/interfaces/curbie-config.interface';

@Module({
  controllers: [ChatPageController],
  providers: [
    {
      provide: CONFIG,
      useFactory: (): CurbieConfig => parseConfig(process.env, { skillsDirectory: resolve(process.cwd(), '..', 'skills') }),
    },
    { provide: CLOCK, useFactory: (): Clock => new SystemClock() },
    { provide: ID_GENERATOR, useFactory: (): IdGenerator => new RandomIdGenerator() },
    {
      provide: DATABASE,
      inject: [CONFIG],
      useFactory: (config: CurbieConfig): Database.Database => openDatabase(config.dataDirectory),
    },
    {
      provide: TRANSCRIPTS,
      inject: [DATABASE],
      useFactory: (database: Database.Database): TranscriptRepository => new SqliteTranscriptRepository(database),
    },
    {
      provide: MODEL,
      inject: [CONFIG],
      useFactory: (config: CurbieConfig): ModelPort =>
        new OllamaModelAdapter({
          baseUrl: config.ollamaBaseUrl,
          modelName: config.modelName,
          fetchFunction: (url, init) => fetch(url, init),
        }),
    },
    {
      provide: TOOL_REGISTRY,
      inject: [CONFIG, ID_GENERATOR],
      useFactory: (config: CurbieConfig, idGenerator: IdGenerator): ToolRegistry =>
        buildToolRegistry(loadSkillDocuments(config.skillsDirectory), createSkillAdapters(), idGenerator),
    },
    {
      provide: ORCHESTRATOR,
      inject: [MODEL, TOOL_REGISTRY, TRANSCRIPTS, CLOCK, ID_GENERATOR, CONFIG],
      useFactory: (
        model: ModelPort,
        toolRegistry: ToolRegistry,
        transcripts: TranscriptRepository,
        clock: Clock,
        idGenerator: IdGenerator,
        config: CurbieConfig,
      ): ConversationOrchestrator =>
        new ConversationOrchestrator({
          model,
          toolRegistry,
          transcripts,
          clock,
          idGenerator,
          systemPrompt: buildSystemPrompt(toolRegistry.registeredSkills()),
          historyMessageLimit: config.historyMessageLimit,
          maxToolRounds: config.maxToolRounds,
        }),
    },
    { provide: GENERATION_QUEUE, useFactory: (): SerialTaskQueue => new SerialTaskQueue() },
    DatabaseLifecycle,
    ChatGateway,
  ],
})
export class AppModule {}
