import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveType } from '../common/enums/leave-type.enum';
import { HCM_CLIENT, HcmBalanceSnapshot, HcmClient } from '../common/hcm/hcm-client.interface';
import { Balance } from '../database/entities/balance.entity';

export interface BalanceKey {
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
}

@Injectable()
export class BalancesService {
  private readonly logger = new Logger(BalancesService.name);

  constructor(
    @InjectRepository(Balance)
    private readonly balances: Repository<Balance>,
    @Inject(HCM_CLIENT)
    private readonly hcm: HcmClient,
  ) {}

  static freeDays(balance: Balance): number {
    return balance.availableDays;
  }

  find(key: BalanceKey): Promise<Balance | null> {
    return this.balances.findOne({ where: { ...key } });
  }

  list(filter: Partial<BalanceKey> = {}): Promise<Balance[]> {
    return this.balances.find({ where: { ...filter } });
  }

  async findOrFail(key: BalanceKey): Promise<Balance> {
    const balance = await this.find(key);
    if (!balance) {
      throw new NotFoundException(
        `No balance for employee ${key.employeeId} / location ${key.locationId} / ${key.leaveType}`,
      );
    }
    return balance;
  }

  async getOrPull(key: BalanceKey): Promise<Balance> {
    const existing = await this.find(key);
    if (existing) {
      return existing;
    }
    const snapshot = await this.hcm.getBalance(key.employeeId, key.locationId, key.leaveType);
    return this.applySnapshot(snapshot);
  }

  async reserve(key: BalanceKey, days: number): Promise<Balance> {
    const balance = await this.findOrFail(key);
    balance.availableDays = round2(balance.availableDays - days);
    balance.pendingDays = round2(balance.pendingDays + days);
    return this.balances.save(balance);
  }

  async commit(key: BalanceKey, days: number): Promise<Balance> {
    const balance = await this.findOrFail(key);
    balance.pendingDays = round2(Math.max(0, balance.pendingDays - days));
    return this.balances.save(balance);
  }

  async release(key: BalanceKey, days: number): Promise<Balance> {
    const balance = await this.findOrFail(key);
    balance.availableDays = round2(balance.availableDays + days);
    balance.pendingDays = round2(Math.max(0, balance.pendingDays - days));
    return this.balances.save(balance);
  }

  async restore(key: BalanceKey, days: number): Promise<Balance> {
    const balance = await this.findOrFail(key);
    balance.availableDays = round2(balance.availableDays + days);
    return this.balances.save(balance);
  }

  async applySnapshot(snapshot: HcmBalanceSnapshot): Promise<Balance> {
    const key: BalanceKey = {
      employeeId: snapshot.employeeId,
      locationId: snapshot.locationId,
      leaveType: snapshot.leaveType,
    };
    const existing = await this.find(key);
    const balance = existing ?? this.balances.create({ ...key, pendingDays: 0 });

    if (existing && existing.availableDays !== snapshot.availableDays) {
      this.logger.log(
        `HCM drift for ${key.employeeId}/${key.locationId}/${key.leaveType}: ` +
          `available ${existing.availableDays} -> ${snapshot.availableDays}`,
      );
    }

    balance.entitledDays = snapshot.entitledDays;
    balance.availableDays = snapshot.availableDays;
    balance.sourceUpdatedAt = snapshot.sourceUpdatedAt
      ? new Date(snapshot.sourceUpdatedAt)
      : new Date();
    balance.lastSyncedAt = new Date();
    return this.balances.save(balance);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
