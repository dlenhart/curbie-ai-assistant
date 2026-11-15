import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './adapters/web/app.configurator';
import { AppModule } from './app.module';
import { listLanAddresses } from './adapters/system/lan-address.finder';
import { CONFIG, SETTINGS, WILDCARD_HTTP_HOSTS } from './constants';
import type { HouseholdSettingsService } from './core/settings/household-settings.service';
import type { CurbieConfig } from './infrastructure/config/interfaces/curbie-config.interface';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  configureApp(app);
  const config = app.get<CurbieConfig>(CONFIG);
  await app.listen(config.httpPort, config.httpHost);
  Logger.log(`Curbie is listening on http://${config.httpHost}:${config.httpPort} (model: ${app.get<HouseholdSettingsService>(SETTINGS).current().modelName})`, 'Bootstrap');
  if (!WILDCARD_HTTP_HOSTS.has(config.httpHost)) return;
  for (const address of listLanAddresses()) {
    Logger.log(`On your home network: http://${address}:${config.httpPort}`, 'Bootstrap');
  }
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
