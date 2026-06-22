import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffController } from '../controllers/time-off.controller';
import { TimeOffRequest } from '../database/entities/time-off-request.entity';
import { TimeOffService } from '../services/time-off.service';
import { BalancesModule } from './balances.module';
import { HcmModule } from './hcm.module';

@Module({
  imports: [TypeOrmModule.forFeature([TimeOffRequest]), BalancesModule, HcmModule],
  controllers: [TimeOffController],
  providers: [TimeOffService],
  exports: [TimeOffService],
})
export class TimeOffModule {}
