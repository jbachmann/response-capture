import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogRepository } from './catalog.repository.js';

@Module({
  imports: [],
  controllers: [CatalogController],
  providers: [CatalogRepository],
})
export class AppModule {}
