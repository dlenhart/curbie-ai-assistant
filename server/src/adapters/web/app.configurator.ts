import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { evaluateRequestOrigin } from './request-origin.policy';

export function configureApp(app: NestExpressApplication): void {
  const serverRoot = join(__dirname, '..', '..', '..');
  app.useWebSocketAdapter(new WsAdapter(app));
  app.use(refuseForeignRequests);
  app.setBaseViewsDir(join(serverRoot, 'views'));
  app.setViewEngine('hbs');
  app.useStaticAssets(join(serverRoot, 'public'), { prefix: '/static/' });
}

function refuseForeignRequests(request: IncomingMessage, response: ServerResponse, next: () => void): void {
  const verdict = evaluateRequestOrigin({ host: request.headers.host, origin: request.headers.origin });
  if (verdict.isAllowed) {
    next();
    return;
  }
  response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(verdict.reason);
}
