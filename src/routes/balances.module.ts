import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalancesController } from '../controllers/balances.controller';
import { Balance } from '../database/entities/balance.entity';
import { BalancesService } from '../services/balances.service';
import { HcmModule } from './hcm.module';

@Module({
  imports: [TypeOrmModule.forFeature([Balance]), HcmModule],
  controllers: [BalancesController],
  providers: [BalancesService],
  exports: [BalancesService],
})
export class BalancesModule {}
