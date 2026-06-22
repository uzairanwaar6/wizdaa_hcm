export enum TimeOffStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export const TIME_OFF_STATUSES = Object.values(TimeOffStatus);
