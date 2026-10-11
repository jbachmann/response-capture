import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Express, RequestHandler } from 'express';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureApp(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: 10 * 1024 * 1024 });

  const config = new DocumentBuilder()
    .setTitle('Catalog API')
    .setDescription('Submit catalogs and retrieve them by system, alias, or commit hash.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config), { ui: false });

  const scalarBundle = join(
    dirname(createRequire(import.meta.url).resolve('@scalar/api-reference')),
    'browser/standalone.js',
  );
  const server: Express = app.getHttpAdapter().getInstance();
  server.get('/docs/scalar.js', (_request, response) => {
    response.sendFile(scalarBundle);
  });
  const reference = apiReference({
    url: '/docs-json',
    cdn: '/docs/scalar.js',
    pageTitle: 'Catalog API',
    withDefaultFonts: false,
  }) as RequestHandler;
  server.get('/docs', reference);
  server.get('/docs/', reference);
}
