import { Inject, Injectable, Logger } from '@nestjs/common';
import { LeaveType } from '../common/enums/leave-type.enum';
import { HCM_CLIENT, HcmBalanceSnapshot, HcmClient } from '../common/hcm/hcm-client.interface';
import { Balance } from '../database/entities/balance.entity';
import { BalancesService, BalanceKey } from './balances.service';

export interface SyncSummary {
  processed: number;
  updated: number;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly balances: BalancesService,
    @Inject(HCM_CLIENT)
    private readonly hcm: HcmClient,
  ) {}

  async refreshOne(key: BalanceKey): Promise<Balance> {
    const snapshot = await this.hcm.getBalance(key.employeeId, key.locationId, key.leaveType);
    return this.balances.applySnapshot(snapshot);
  }

  async importBatch(): Promise<SyncSummary> {
    const snapshots = await this.hcm.fetchBatch();
    return this.applyAll(snapshots, 'pull');
  }

  async applyBatch(snapshots: HcmBalanceSnapshot[]): Promise<SyncSummary> {
    return this.applyAll(snapshots, 'push');
  }

  private async applyAll(snapshots: HcmBalanceSnapshot[], source: string): Promise<SyncSummary> {
    let updated = 0;

    for (const snapshot of snapshots) {
      const key: BalanceKey = {
        employeeId: snapshot.employeeId,
        locationId: snapshot.locationId,
        leaveType: snapshot.leaveType,
      };
      const before = await this.balances.find(key);
      await this.balances.applySnapshot(snapshot);
      if (!before || before.availableDays !== snapshot.availableDays) {
        updated += 1;
      }
    }

    this.logger.log(`Batch sync (${source}): processed ${snapshots.length}, updated ${updated}.`);
    return { processed: snapshots.length, updated };
  }
}

export type { BalanceKey };
export { LeaveType };
