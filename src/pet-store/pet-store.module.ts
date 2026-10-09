import { Module } from '@nestjs/common';
import { DatabaseProvider } from './database.provider.js';
import { PetController } from './pet.controller.js';
import { PetService } from './pet.service.js';
import { StoreController } from './store.controller.js';
import { StoreService } from './store.service.js';
@Module({
  controllers: [PetController, StoreController],
  providers: [DatabaseProvider, PetService, StoreService],
})
export class PetStoreModule {}
