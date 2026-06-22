import { LeaveType } from '../common/enums/leave-type.enum';
import { SyncController } from './sync.controller';

describe('SyncController', () => {
  let service: { importBatch: jest.Mock; refreshOne: jest.Mock };
  let controller: SyncController;

  beforeEach(() => {
    service = {
      importBatch: jest.fn().mockResolvedValue({ processed: 0, updated: 0 }),
      refreshOne: jest.fn(),
    };
    controller = new SyncController(service as never);
  });

  it('importBatch delegates to the service', async () => {
    await controller.importBatch();
    expect(service.importBatch).toHaveBeenCalledTimes(1);
  });

  it('refresh passes the balance key through', async () => {
    const dto = { employeeId: 'e1', locationId: 'l1', leaveType: LeaveType.VACATION };
    await controller.refresh(dto);
    expect(service.refreshOne).toHaveBeenCalledWith(dto);
  });
});
