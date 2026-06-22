import { NotFoundException } from '@nestjs/common';
import { LeaveType } from '../common/enums/leave-type.enum';
import { HcmBalanceSnapshot, HcmClient } from '../common/hcm/hcm-client.interface';
import { Balance } from '../database/entities/balance.entity';
import { BalancesService, BalanceKey } from './balances.service';

const KEY: BalanceKey = {
  employeeId: 'e1',
  locationId: 'l1',
  leaveType: LeaveType.VACATION,
};

function makeBalance(overrides: Partial<Balance> = {}): Balance {
  return {
    id: 'b1',
    employeeId: 'e1',
    locationId: 'l1',
    leaveType: LeaveType.VACATION,
    entitledDays: 20,
    availableDays: 10,
    pendingDays: 0,
    version: 1,
    sourceUpdatedAt: null,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Balance;
}

describe('BalancesService', () => {
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let hcm: jest.Mocked<HcmClient>;
  let service: BalancesService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => dto as Balance),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    hcm = {
      getBalance: jest.fn(),
      postTimeOff: jest.fn(),
      cancelTimeOff: jest.fn(),
      fetchBatch: jest.fn(),
    };
    service = new BalancesService(repo as never, hcm);
  });

  it('freeDays equals availableDays (already net of filed reservations)', () => {
    expect(BalancesService.freeDays(makeBalance({ availableDays: 8, pendingDays: 3 }))).toBe(8);
  });

  it('findOrFail throws NotFound when missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOrFail(KEY)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('getOrPull', () => {
    it('returns the cached balance when present (no HCM call)', async () => {
      const cached = makeBalance();
      repo.findOne.mockResolvedValue(cached);
      await expect(service.getOrPull(KEY)).resolves.toBe(cached);
      expect(hcm.getBalance).not.toHaveBeenCalled();
    });

    it('pulls from HCM and caches when absent', async () => {
      repo.findOne.mockResolvedValue(null);
      const snapshot: HcmBalanceSnapshot = {
        ...KEY,
        entitledDays: 25,
        availableDays: 12,
        sourceUpdatedAt: '2026-01-01T00:00:00.000Z',
      };
      hcm.getBalance.mockResolvedValue(snapshot);

      const result = await service.getOrPull(KEY);

      expect(hcm.getBalance).toHaveBeenCalledWith('e1', 'l1', LeaveType.VACATION);
      expect(result.availableDays).toBe(12);
      expect(repo.save).toHaveBeenCalled();
    });
  });

  it('reserve debits available and tracks pending (filing)', async () => {
    repo.findOne.mockResolvedValue(makeBalance({ availableDays: 10, pendingDays: 1 }));
    const saved = await service.reserve(KEY, 2.5);
    expect(saved.availableDays).toBe(7.5);
    expect(saved.pendingDays).toBe(3.5);
  });

  it('commit clears pending without changing available (approval)', async () => {
    repo.findOne.mockResolvedValue(makeBalance({ availableDays: 8, pendingDays: 2 }));
    const saved = await service.commit(KEY, 2);
    expect(saved.pendingDays).toBe(0);
    expect(saved.availableDays).toBe(8);
  });

  it('release restores available and clears pending (reject / cancel-pending)', async () => {
    repo.findOne.mockResolvedValue(makeBalance({ availableDays: 8, pendingDays: 2 }));
    const saved = await service.release(KEY, 2);
    expect(saved.availableDays).toBe(10);
    expect(saved.pendingDays).toBe(0);
  });

  it('restore adds days back to available (cancel-approved)', async () => {
    repo.findOne.mockResolvedValue(makeBalance({ availableDays: 8, pendingDays: 0 }));
    const saved = await service.restore(KEY, 2);
    expect(saved.availableDays).toBe(10);
  });

  describe('applySnapshot', () => {
    it('creates a new row and preserves pendingDays=0 when none exists', async () => {
      repo.findOne.mockResolvedValue(null);
      const saved = await service.applySnapshot({
        ...KEY,
        entitledDays: 30,
        availableDays: 15,
      });
      expect(saved.availableDays).toBe(15);
      expect(saved.pendingDays).toBe(0);
      expect(saved.lastSyncedAt).toBeInstanceOf(Date);
    });

    it('preserves local pendingDays while adopting HCM available (anniversary refresh)', async () => {
      repo.findOne.mockResolvedValue(makeBalance({ availableDays: 5, pendingDays: 2 }));
      const saved = await service.applySnapshot({
        ...KEY,
        entitledDays: 20,
        availableDays: 15,
      });
      expect(saved.availableDays).toBe(15);
      expect(saved.pendingDays).toBe(2);
    });
  });
});
