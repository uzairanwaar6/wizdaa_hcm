import { Module } from '@nestjs/common';
import { HCM_CLIENT } from '../common/hcm/hcm-client.interface';
import { HttpHcmClient } from '../services/hcm.service';

@Module({
  providers: [{ provide: HCM_CLIENT, useClass: HttpHcmClient }],
  exports: [HCM_CLIENT],
})
export class HcmModule {}
