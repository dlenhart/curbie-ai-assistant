import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import type Database from 'better-sqlite3';
import { DataDirectoryRecipeFileStore } from './adapters/files/data-directory-recipe-file.store';
import { OllamaModelCatalogAdapter } from './adapters/model/ollama-model-catalog.adapter';
import { OllamaModelAdapter } from './adapters/model/ollama-model.adapter';
import { OllamaModelLoader } from './adapters/model/ollama-model.loader';
import { VisionOcrInvoker } from './adapters/ocr/vision-ocr.invoker';
import { DatabaseLifecycle } from './adapters/persistence/database.lifecycle';
import { openDatabase } from './adapters/persistence/database.factory';
import { SqliteRecipeRepository } from './adapters/persistence/sqlite-recipe.repository';
import { SqliteSettingsRepository } from './adapters/persistence/sqlite-settings.repository';
import { SqliteTranscriptRepository } from './adapters/persistence/sqlite-transcript.repository';
import { createSkillAdapters } from './adapters/skills/skill-adapters.factory';
import { loadSkillDocuments } from './adapters/skills/skill-directory.loader';
import { RandomIdGenerator } from './adapters/system/random-id.generator';
import { buildSupportedTimeZones } from './adapters/system/supported-time-zones.factory';
import { SystemClock } from './adapters/system/system.clock';
import { ChatPageController } from './adapters/web/chat-page.controller';
import { ChatGateway } from './adapters/web/chat.gateway';
import { ManagePageController } from './adapters/web/manage-page.controller';
import { RecipeViewController } from './adapters/web/recipe-view.controller';
import { RecipesPageController } from './adapters/web/recipes-page.controller';
import { SettingsPageController } from './adapters/web/settings-page.controller';
import {
  CLOCK,
  CONFIG,
  DATABASE,
  DEFAULT_UNITS,
  GENERATION_QUEUE,
  ID_GENERATOR,
  MODEL,
  MODEL_CATALOG,
  MODEL_LOADER,
  OCR,
  ORCHESTRATOR,
  RECIPE_FILE_STORE,
  RECIPE_LIBRARY,
  RECIPE_REPOSITORY,
  RECIPE_SCANNER,
  SETTINGS,
  SETTINGS_REPOSITORY,
  SUPPORTED_TIME_ZONES,
  TOOL_REGISTRY,
  TRANSCRIPTS,
} from './constants';
import { ConversationOrchestrator } from './core/conversation/conversation.orchestrator';
import type { TranscriptRepository } from './core/conversation/interfaces/transcript-repository.interface';
import { buildSystemPrompt } from './core/conversation/system-prompt.builder';
import type { ModelCatalogPort } from './core/model/interfaces/model-catalog-port.interface';
import type { ModelLoaderPort } from './core/model/interfaces/model-loader-port.interface';
import type { ModelPort } from './core/model/interfaces/model-port.interface';
import { ModelLoadingDecorator } from './core/model/model-loading.decorator';
import type { OcrPort } from './core/recipes/interfaces/ocr-port.interface';
import type { RecipeFileStore } from './core/recipes/interfaces/recipe-file-store.interface';
import type { RecipeRepository } from './core/recipes/interfaces/recipe-repository.interface';
import { RecipeLibraryService } from './core/recipes/recipe-library.service';
import { RecipeInboxScanner } from './core/recipes/recipe-inbox.scanner';
import { RecipeLineLabeller } from './core/recipes/recipe-line.labeller';
import { HouseholdSettingsService } from './core/settings/household-settings.service';
import type { SettingsRepository } from './core/settings/interfaces/settings-repository.interface';
import type { Clock } from './core/shared/interfaces/clock.interface';
import type { IdGenerator } from './core/shared/interfaces/id-generator.interface';
import { SerialTaskQueue } from './core/shared/serial-task.queue';
import { buildToolRegistry } from './core/skills/tool-registry.factory';
import type { ToolRegistry } from './core/skills/tool.registry';
import { parseConfig } from './infrastructure/config/curbie-config.parser';
import type { CurbieConfig } from './infrastructure/config/interfaces/curbie-config.interface';

@Module({
  controllers: [ChatPageController, ManagePageController, SettingsPageController, RecipesPageController, RecipeViewController],
  providers: [
    {
      provide: CONFIG,
      useFactory: (): CurbieConfig => parseConfig(process.env, {
        skillsDirectory: resolve(process.cwd(), '..', 'skills'),
        ocrBinaryPath: resolve(process.cwd(), '..', 'ocr', 'bin', 'curbie-ocr'),
      }),
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
      provide: MODEL_LOADER,
      inject: [CONFIG],
      useFactory: (config: CurbieConfig): ModelLoaderPort =>
        new OllamaModelLoader({
          baseUrl: config.ollamaBaseUrl,
          getFunction: (url, init) => fetch(url, init),
          postFunction: (url, init) => fetch(url, init),
        }),
    },
    {
      provide: MODEL,
      inject: [CONFIG, MODEL_LOADER],
      useFactory: (config: CurbieConfig, loader: ModelLoaderPort): ModelPort =>
        new ModelLoadingDecorator(
          loader,
          new OllamaModelAdapter({
            baseUrl: config.ollamaBaseUrl,
            fetchFunction: (url, init) => fetch(url, init),
          }),
        ),
    },
    {
      provide: MODEL_CATALOG,
      inject: [CONFIG],
      useFactory: (config: CurbieConfig): ModelCatalogPort =>
        new OllamaModelCatalogAdapter({ baseUrl: config.ollamaBaseUrl, fetchFunction: (url, init) => fetch(url, init) }),
    },
    {
      provide: SETTINGS_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: Database.Database): SettingsRepository => new SqliteSettingsRepository(database),
    },
    {
      provide: SUPPORTED_TIME_ZONES,
      useFactory: (): ReadonlySet<string> => buildSupportedTimeZones(Intl.DateTimeFormat().resolvedOptions().timeZone),
    },
    {
      provide: SETTINGS,
      inject: [SETTINGS_REPOSITORY, MODEL_CATALOG, CLOCK, CONFIG, SUPPORTED_TIME_ZONES],
      useFactory: (
        repository: SettingsRepository,
        modelCatalog: ModelCatalogPort,
        clock: Clock,
        config: CurbieConfig,
        supportedTimeZones: ReadonlySet<string>,
      ): HouseholdSettingsService =>
        new HouseholdSettingsService({
          repository,
          modelCatalog,
          clock,
          supportedTimeZones,
          defaults: {
            modelName: config.modelName,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            units: DEFAULT_UNITS,
          },
        }),
    },
    {
      provide: TOOL_REGISTRY,
      inject: [CONFIG, ID_GENERATOR, CLOCK, RECIPE_REPOSITORY],
      useFactory: (
        config: CurbieConfig,
        idGenerator: IdGenerator,
        clock: Clock,
        recipeRepository: RecipeRepository,
      ): ToolRegistry =>
        buildToolRegistry(
          loadSkillDocuments(config.skillsDirectory),
          createSkillAdapters({ clock, recipeRepository }),
          idGenerator,
        ),
    },
    {
      provide: ORCHESTRATOR,
      inject: [MODEL, TOOL_REGISTRY, TRANSCRIPTS, CLOCK, ID_GENERATOR, CONFIG, SETTINGS],
      useFactory: (
        model: ModelPort,
        toolRegistry: ToolRegistry,
        transcripts: TranscriptRepository,
        clock: Clock,
        idGenerator: IdGenerator,
        config: CurbieConfig,
        settings: HouseholdSettingsService,
      ): ConversationOrchestrator =>
        new ConversationOrchestrator({
          model,
          toolRegistry,
          transcripts,
          clock,
          idGenerator,
          systemPrompt: buildSystemPrompt(toolRegistry.registeredSkills()),
          settings,
          historyMessageLimit: config.historyMessageLimit,
          maxToolRounds: config.maxToolRounds,
        }),
    },
    { provide: GENERATION_QUEUE, useFactory: (): SerialTaskQueue => new SerialTaskQueue() },
    {
      provide: OCR,
      inject: [CONFIG],
      useFactory: (config: CurbieConfig): OcrPort =>
        new VisionOcrInvoker({ binaryPath: config.ocrBinaryPath, dataDirectory: config.dataDirectory }),
    },
    {
      provide: RECIPE_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: Database.Database): RecipeRepository => new SqliteRecipeRepository(database),
    },
    {
      provide: RECIPE_FILE_STORE,
      inject: [CONFIG],
      useFactory: (config: CurbieConfig): RecipeFileStore => new DataDirectoryRecipeFileStore(config.dataDirectory),
    },
    {
      provide: RECIPE_SCANNER,
      inject: [RECIPE_FILE_STORE, OCR, MODEL, RECIPE_REPOSITORY, SETTINGS, GENERATION_QUEUE, CLOCK, ID_GENERATOR],
      useFactory: (
        files: RecipeFileStore,
        ocr: OcrPort,
        model: ModelPort,
        repository: RecipeRepository,
        settings: HouseholdSettingsService,
        generationQueue: SerialTaskQueue,
        clock: Clock,
        idGenerator: IdGenerator,
      ): RecipeInboxScanner =>
        new RecipeInboxScanner({
          files,
          ocr,
          labeller: new RecipeLineLabeller(model),
          repository,
          settings,
          generationQueue,
          clock,
          idGenerator,
        }),
    },
    {
      provide: RECIPE_LIBRARY,
      inject: [RECIPE_REPOSITORY, RECIPE_FILE_STORE, CLOCK],
      useFactory: (repository: RecipeRepository, files: RecipeFileStore, clock: Clock): RecipeLibraryService =>
        new RecipeLibraryService({ repository, files, clock }),
    },
    DatabaseLifecycle,
    ChatGateway,
  ],
})
export class AppModule {}
