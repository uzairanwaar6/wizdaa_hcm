import { LeaveType } from '../common/enums/leave-type.enum';
import { HcmBalanceSnapshot, HcmClient } from '../common/hcm/hcm-client.interface';
import { SyncService } from './sync.service';

function snapshot(overrides: Partial<HcmBalanceSnapshot> = {}): HcmBalanceSnapshot {
  return {
    employeeId: 'e1',
    locationId: 'l1',
    leaveType: LeaveType.VACATION,
    entitledDays: 20,
    availableDays: 10,
    ...overrides,
  };
}

describe('SyncService', () => {
  let balances: { applySnapshot: jest.Mock; find: jest.Mock };
  let hcm: jest.Mocked<HcmClient>;
  let service: SyncService;

  beforeEach(() => {
    balances = {
      applySnapshot: jest.fn((s) => Promise.resolve(s)),
      find: jest.fn(),
    };
    hcm = {
      getBalance: jest.fn(),
      postTimeOff: jest.fn(),
      cancelTimeOff: jest.fn(),
      fetchBatch: jest.fn(),
    };
    service = new SyncService(balances as never, hcm);
  });

  it('refreshOne pulls a single balance and applies it', async () => {
    hcm.getBalance.mockResolvedValue(snapshot({ availableDays: 12 }));
    await service.refreshOne({ employeeId: 'e1', locationId: 'l1', leaveType: LeaveType.VACATION });
    expect(hcm.getBalance).toHaveBeenCalledWith('e1', 'l1', LeaveType.VACATION);
    expect(balances.applySnapshot).toHaveBeenCalledTimes(1);
  });

  it('importBatch applies every snapshot and counts changed rows', async () => {
    hcm.fetchBatch.mockResolvedValue([
      snapshot({ employeeId: 'e1', availableDays: 12 }),
      snapshot({ employeeId: 'e2', availableDays: 8 }),
    ]);

    balances.find
      .mockResolvedValueOnce({ availableDays: 10 } as never)
      .mockResolvedValueOnce({ availableDays: 8 } as never);

    const summary = await service.importBatch();

    expect(summary.processed).toBe(2);
    expect(summary.updated).toBe(1);
    expect(balances.applySnapshot).toHaveBeenCalledTimes(2);
  });

  it('importBatch counts brand-new balances as updates', async () => {
    hcm.fetchBatch.mockResolvedValue([snapshot()]);
    balances.find.mockResolvedValue(null);
    const summary = await service.importBatch();
    expect(summary.updated).toBe(1);
  });
});
