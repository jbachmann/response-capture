import { Module } from '@nestjs/common';
import { PetStoreModule } from './pet-store/pet-store.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [PetStoreModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
