import { LeaveType } from '../enums/leave-type.enum';

export const HCM_CLIENT = Symbol('HCM_CLIENT');

export interface HcmBalanceSnapshot {
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
  entitledDays: number;
  availableDays: number;

  sourceUpdatedAt?: string | null;
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

export interface HcmClient {
  getBalance(
    employeeId: string,
    locationId: string,
    leaveType: LeaveType,
  ): Promise<HcmBalanceSnapshot>;

  postTimeOff(command: HcmTimeOffCommand): Promise<void>;

  cancelTimeOff(externalRef: string, command: HcmTimeOffCommand): Promise<void>;

  fetchBatch(): Promise<HcmBalanceSnapshot[]>;
}

export class HcmRejectionError extends Error {
  constructor(
    message: string,
    readonly reason: 'INSUFFICIENT_BALANCE' | 'INVALID_DIMENSIONS' | 'REJECTED' = 'REJECTED',
  ) {
    super(message);
    this.name = 'HcmRejectionError';
  }
}

export class HcmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HcmUnavailableError';
  }
}
