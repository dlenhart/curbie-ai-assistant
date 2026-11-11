import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';

export function configureApp(app: NestExpressApplication): void {
  const serverRoot = join(__dirname, '..', '..', '..');
  app.useWebSocketAdapter(new WsAdapter(app));
  app.setBaseViewsDir(join(serverRoot, 'views'));
  app.setViewEngine('hbs');
  app.useStaticAssets(join(serverRoot, 'public'), { prefix: '/static/' });
}
