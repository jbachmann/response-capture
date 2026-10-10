import { Module } from '@nestjs/common';
import { PetStoreModule } from './pet-store/pet-store.module.js';

@Module({
  imports: [PetStoreModule],
})
export class AppModule {}
