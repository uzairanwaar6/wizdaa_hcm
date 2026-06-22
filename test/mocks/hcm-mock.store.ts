import { LeaveType } from '../../src/common/enums/leave-type.enum';

export type HcmMode = 'normal' | 'outage';

export interface HcmStoredBalance {
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
  entitledDays: number;
  availableDays: number;
  sourceUpdatedAt: string;
}

export interface HcmTimeOffCommand {
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
  numberOfDays: number;
  startDate: string;
  endDate: string;
  externalRef: string;
}

export interface HcmFileResult {
  ok: boolean;
  status?: number;
  error?: string;
  message?: string;
}

function keyOf(employeeId: string, locationId: string, leaveType: LeaveType): string {
  return `${employeeId}|${locationId}|${leaveType}`;
}

export class HcmMockStore {
  mode: HcmMode = 'normal';

  private readonly balances = new Map<string, HcmStoredBalance>();
  private readonly reservations = new Map<string, HcmTimeOffCommand>();

  seed(balance: Omit<HcmStoredBalance, 'sourceUpdatedAt'> & { sourceUpdatedAt?: string }): void {
    const k = keyOf(balance.employeeId, balance.locationId, balance.leaveType);
    this.balances.set(k, {
      ...balance,
      sourceUpdatedAt: balance.sourceUpdatedAt ?? new Date().toISOString(),
    });
  }

  getBalance(
    employeeId: string,
    locationId: string,
    leaveType: LeaveType,
  ): HcmStoredBalance | undefined {
    return this.balances.get(keyOf(employeeId, locationId, leaveType));
  }

  file(command: HcmTimeOffCommand): HcmFileResult {
    const k = keyOf(command.employeeId, command.locationId, command.leaveType);
    const balance = this.balances.get(k);
    if (!balance) {
      return {
        ok: false,
        status: 404,
        error: 'INVALID_DIMENSIONS',
        message: 'Unknown employee/location/leaveType combination.',
      };
    }
    if (command.numberOfDays > balance.availableDays) {
      return {
        ok: false,
        status: 422,
        error: 'INSUFFICIENT_BALANCE',
        message: `Requested ${command.numberOfDays} exceeds available ${balance.availableDays}.`,
      };
    }
    balance.availableDays = round2(balance.availableDays - command.numberOfDays);
    balance.sourceUpdatedAt = new Date().toISOString();
    this.reservations.set(command.externalRef, command);
    return { ok: true };
  }

  cancel(externalRef: string): void {
    const command = this.reservations.get(externalRef);
    if (!command) {
      return;
    }
    const k = keyOf(command.employeeId, command.locationId, command.leaveType);
    const balance = this.balances.get(k);
    if (balance) {
      balance.availableDays = round2(balance.availableDays + command.numberOfDays);
      balance.sourceUpdatedAt = new Date().toISOString();
    }
    this.reservations.delete(externalRef);
  }

  batch(): HcmStoredBalance[] {
    return [...this.balances.values()].map((b) => ({ ...b }));
  }

  applyAnniversary(
    employeeId: string,
    locationId: string,
    leaveType: LeaveType,
    bonusDays: number,
  ): void {
    const balance = this.balances.get(keyOf(employeeId, locationId, leaveType));
    if (balance) {
      balance.entitledDays = round2(balance.entitledDays + bonusDays);
      balance.availableDays = round2(balance.availableDays + bonusDays);
      balance.sourceUpdatedAt = new Date().toISOString();
    }
  }

  reset(): void {
    this.balances.clear();
    this.reservations.clear();
    this.mode = 'normal';
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
