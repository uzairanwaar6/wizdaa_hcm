import {
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LeaveType } from '../common/enums/leave-type.enum';
import { TimeOffStatus } from '../common/enums/time-off-status.enum';
import {
  HcmClient,
  HcmRejectionError,
  HcmUnavailableError,
} from '../common/hcm/hcm-client.interface';
import { TimeOffRequest } from '../database/entities/time-off-request.entity';
import { BalancesService } from './balances.service';
import { CreateTimeOffInput, TimeOffService } from './time-off.service';

const BASE_INPUT: CreateTimeOffInput = {
  employeeId: 'e1',
  locationId: 'l1',
  leaveType: LeaveType.VACATION,
  startDate: '2026-07-01',
  endDate: '2026-07-02',
};

function makeRequest(overrides: Partial<TimeOffRequest> = {}): TimeOffRequest {
  return {
    id: 'r1',
    employeeId: 'e1',
    locationId: 'l1',
    leaveType: LeaveType.VACATION,
    startDate: '2026-07-01',
    endDate: '2026-07-02',
    numberOfDays: 2,
    status: TimeOffStatus.PENDING,
    idempotencyKey: null,
    decidedBy: null,
    decidedAt: null,
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TimeOffRequest;
}

describe('TimeOffService', () => {
  let repo: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let balances: jest.Mocked<
    Pick<BalancesService, 'getOrPull' | 'reserve' | 'release' | 'commit' | 'restore'>
  >;
  let hcm: jest.Mocked<HcmClient>;
  let service: TimeOffService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    balances = {
      getOrPull: jest.fn(),
      reserve: jest.fn(),
      release: jest.fn(),
      commit: jest.fn(),
      restore: jest.fn(),
    };
    hcm = {
      getBalance: jest.fn(),
      postTimeOff: jest.fn().mockResolvedValue(undefined),
      cancelTimeOff: jest.fn().mockResolvedValue(undefined),
      fetchBatch: jest.fn(),
    };
    service = new TimeOffService(repo as never, balances as never, hcm);
  });

  describe('create', () => {
    const sufficient = { availableDays: 10, pendingDays: 0 };

    it('files with HCM, reserves locally and persists a PENDING request', async () => {
      balances.getOrPull.mockResolvedValue(sufficient as never);

      const result = await service.create(BASE_INPUT);

      expect(hcm.postTimeOff).toHaveBeenCalledTimes(1);
      expect(hcm.postTimeOff.mock.calls[0][0]).toMatchObject({
        numberOfDays: 2,
        externalRef: result.id,
      });
      expect(balances.reserve).toHaveBeenCalledWith(
        { employeeId: 'e1', locationId: 'l1', leaveType: LeaveType.VACATION },
        2,
      );
      expect(result.status).toBe(TimeOffStatus.PENDING);
    });

    it('defensively rejects when local balance is insufficient (HCM not called)', async () => {
      balances.getOrPull.mockResolvedValue({ availableDays: 1, pendingDays: 0 } as never);
      await expect(service.create(BASE_INPUT)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(hcm.postTimeOff).not.toHaveBeenCalled();
    });

    it('maps an HCM business rejection to 422', async () => {
      balances.getOrPull.mockResolvedValue(sufficient as never);
      hcm.postTimeOff.mockRejectedValue(
        new HcmRejectionError('insufficient', 'INSUFFICIENT_BALANCE'),
      );
      await expect(service.create(BASE_INPUT)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('maps HCM unavailability to 503 (fail closed)', async () => {
      balances.getOrPull.mockResolvedValue(sufficient as never);
      hcm.postTimeOff.mockRejectedValue(new HcmUnavailableError('timeout'));
      await expect(service.create(BASE_INPUT)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('compensates the HCM reservation if local persistence fails', async () => {
      balances.getOrPull.mockResolvedValue(sufficient as never);
      balances.reserve.mockRejectedValue(new Error('db down'));
      await expect(service.create(BASE_INPUT)).rejects.toThrow('db down');
      expect(hcm.cancelTimeOff).toHaveBeenCalledTimes(1);
    });

    it('replays idempotently: an existing key returns the original request without HCM', async () => {
      const prior = makeRequest();
      repo.findOne.mockResolvedValue(prior);
      const result = await service.create({ ...BASE_INPUT, idempotencyKey: 'k1' });
      expect(result).toBe(prior);
      expect(hcm.postTimeOff).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('commits the balance and marks APPROVED', async () => {
      repo.findOne.mockResolvedValue(makeRequest({ status: TimeOffStatus.PENDING }));
      const result = await service.approve('r1', 'mgr1');
      expect(balances.commit).toHaveBeenCalledWith(expect.any(Object), 2);
      expect(result.status).toBe(TimeOffStatus.APPROVED);
      expect(result.decidedBy).toBe('mgr1');
    });

    it('rejects approving a non-PENDING request (409)', async () => {
      repo.findOne.mockResolvedValue(makeRequest({ status: TimeOffStatus.APPROVED }));
      await expect(service.approve('r1', 'mgr1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reject', () => {
    it('releases the reservation in HCM + locally and marks REJECTED', async () => {
      repo.findOne.mockResolvedValue(makeRequest({ status: TimeOffStatus.PENDING }));
      const result = await service.reject('r1', 'mgr1', 'no coverage');
      expect(hcm.cancelTimeOff).toHaveBeenCalledTimes(1);
      expect(balances.release).toHaveBeenCalledWith(expect.any(Object), 2);
      expect(result.status).toBe(TimeOffStatus.REJECTED);
      expect(result.reason).toBe('no coverage');
    });
  });

  describe('cancel', () => {
    it('restores the balance when cancelling an APPROVED request', async () => {
      repo.findOne.mockResolvedValue(makeRequest({ status: TimeOffStatus.APPROVED }));
      const result = await service.cancel('r1', 'plans changed');
      expect(balances.restore).toHaveBeenCalledWith(expect.any(Object), 2);
      expect(result.status).toBe(TimeOffStatus.CANCELLED);
    });

    it('releases the reservation when cancelling a PENDING request', async () => {
      repo.findOne.mockResolvedValue(makeRequest({ status: TimeOffStatus.PENDING }));
      await service.cancel('r1');
      expect(balances.release).toHaveBeenCalledWith(expect.any(Object), 2);
    });

    it('rejects cancelling an already-terminal request (409)', async () => {
      repo.findOne.mockResolvedValue(makeRequest({ status: TimeOffStatus.REJECTED }));
      await expect(service.cancel('r1')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
