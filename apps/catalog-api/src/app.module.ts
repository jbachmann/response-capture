import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogRepository } from './catalog.repository.js';

@Module({
  imports: [],
  controllers: [AppController, CatalogController],
  providers: [AppService, CatalogRepository],
})
export class AppModule {}
