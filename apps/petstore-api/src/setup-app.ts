import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Express, RequestHandler } from 'express';
import { apiReference } from '@scalar/nestjs-api-reference';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  app.enableShutdownHooks();
  const config = new DocumentBuilder()
    .setTitle('SQLite Petstore')
    .setDescription('Pets and pet orders. No user accounts or authentication.')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, { ui: false });

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
    pageTitle: 'SQLite Petstore',
    withDefaultFonts: false,
  }) as RequestHandler;
  server.get('/docs', reference);
  server.get('/docs/', reference);
}
