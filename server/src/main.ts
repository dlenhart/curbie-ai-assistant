import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './adapters/web/app.configurator';
import { formatHttpUrl } from './adapters/web/http-url.formatter';
import { AppModule } from './app.module';
import { listLanAddresses } from './adapters/system/lan-address.finder';
import { CONFIG, RECIPE_SCANNER, SETTINGS, WILDCARD_HTTP_HOSTS } from './constants';
import type { RecipeInboxScanner } from './core/recipes/recipe-inbox.scanner';
import type { HouseholdSettingsService } from './core/settings/household-settings.service';
import type { CurbieConfig } from './infrastructure/config/interfaces/curbie-config.interface';

function startRecipeScan(scanner: RecipeInboxScanner): void {
  const start = scanner.start();
  if (start.kind !== 'started') return;
  start.completion
    .then((report) => {
      Logger.log(`Recipe scan: ${report.importedCount} imported, ${report.problems.length} problems`, 'Bootstrap');
    })
    .catch((error: unknown) => {
      Logger.error(`Recipe scan failed: ${error instanceof Error ? error.message : String(error)}`, 'Bootstrap');
    });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  configureApp(app);
  const config = app.get<CurbieConfig>(CONFIG);
  await app.listen(config.httpPort, config.httpHost);
  const modelName = app.get<HouseholdSettingsService>(SETTINGS).current().modelName;
  Logger.log(`Curbie is listening on ${formatHttpUrl(config.httpHost, config.httpPort)} (model: ${modelName})`, 'Bootstrap');
  startRecipeScan(app.get<RecipeInboxScanner>(RECIPE_SCANNER));
  if (!WILDCARD_HTTP_HOSTS.has(config.httpHost)) return;
  for (const address of listLanAddresses()) {
    Logger.log(`On your home network: ${formatHttpUrl(address, config.httpPort)}`, 'Bootstrap');
  }
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
