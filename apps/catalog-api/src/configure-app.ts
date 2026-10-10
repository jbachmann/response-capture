import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureApp(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: 10 * 1024 * 1024 });

  const config = new DocumentBuilder()
    .setTitle('Catalog API')
    .setDescription('Submit catalogs and retrieve them by system, alias, or commit hash.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));
}
