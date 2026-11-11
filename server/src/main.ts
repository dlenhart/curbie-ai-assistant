import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './adapters/web/app.configurator';
import { AppModule } from './app.module';
import { CONFIG } from './constants';
import type { CurbieConfig } from './infrastructure/config/interfaces/curbie-config.interface';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  configureApp(app);
  const config = app.get<CurbieConfig>(CONFIG);
  await app.listen(config.httpPort, config.httpHost);
  Logger.log(`Curbie is listening on http://${config.httpHost}:${config.httpPort} (model: ${config.modelName})`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
