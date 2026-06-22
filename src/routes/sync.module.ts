import { Module } from '@nestjs/common';
import { SyncController } from '../controllers/sync.controller';
import { SyncService } from '../services/sync.service';
import { BalancesModule } from './balances.module';
import { HcmModule } from './hcm.module';

@Module({
  imports: [BalancesModule, HcmModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
