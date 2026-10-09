import { Module } from '@nestjs/common';
import { PetStoreModule } from './pet-store/pet-store.module.js';
import { AppController } from './app.controller.js';

@Module({
  imports: [PetStoreModule],
  controllers: [AppController],
})
export class AppModule {}
