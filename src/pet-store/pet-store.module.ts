import { Module } from '@nestjs/common';
import { DatabaseProvider } from './database.provider.js';
import { PetController } from './pet.controller.js';
import { PetService } from './pet.service.js';
import { StoreController } from './store.controller.js';
import { StoreService } from './store.service.js';
import { TrainingController } from './training.controller.js';
import { TrainingService } from './training.service.js';
@Module({
  controllers: [PetController, StoreController, TrainingController],
  providers: [DatabaseProvider, PetService, StoreService, TrainingService],
})
export class PetStoreModule {}
