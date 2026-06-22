import { LeaveType } from '../common/enums/leave-type.enum';
import { CreateTimeOffRequestDto } from '../dtos/time-off.dto';
import { TimeOffController } from './time-off.controller';

describe('TimeOffController', () => {
  let service: {
    create: jest.Mock;
    list: jest.Mock;
    get: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
    cancel: jest.Mock;
  };
  let controller: TimeOffController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
      cancel: jest.fn(),
    };
    controller = new TimeOffController(service as never);
  });

  it('create delegates the DTO to the service', async () => {
    const dto: CreateTimeOffRequestDto = {
      employeeId: 'e1',
      locationId: 'l1',
      leaveType: LeaveType.VACATION,
      startDate: '2026-07-01',
      endDate: '2026-07-02',
    };
    await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('list passes the query through', async () => {
    await controller.list({ status: undefined });
    expect(service.list).toHaveBeenCalled();
  });

  it('get delegates the id', async () => {
    await controller.get('r1');
    expect(service.get).toHaveBeenCalledWith('r1');
  });

  it('approve unpacks managerId', async () => {
    await controller.approve('r1', { managerId: 'mgr1' });
    expect(service.approve).toHaveBeenCalledWith('r1', 'mgr1');
  });

  it('reject unpacks managerId + reason', async () => {
    await controller.reject('r1', { managerId: 'mgr1', reason: 'no' });
    expect(service.reject).toHaveBeenCalledWith('r1', 'mgr1', 'no');
  });

  it('cancel unpacks reason', async () => {
    await controller.cancel('r1', { reason: 'changed' });
    expect(service.cancel).toHaveBeenCalledWith('r1', 'changed');
  });
});
