import { LeaveType } from '../common/enums/leave-type.enum';
import { BalancesController } from './balances.controller';

describe('BalancesController', () => {
  let service: { list: jest.Mock; findOrFail: jest.Mock };
  let controller: BalancesController;

  beforeEach(() => {
    service = { list: jest.fn().mockResolvedValue([]), findOrFail: jest.fn() };
    controller = new BalancesController(service as never);
  });

  it('list delegates the query filter to the service', async () => {
    const query = { employeeId: 'e1' };
    await controller.list(query);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('get builds the composite key and delegates to findOrFail', async () => {
    await controller.get('e1', 'l1', LeaveType.SICK);
    expect(service.findOrFail).toHaveBeenCalledWith({
      employeeId: 'e1',
      locationId: 'l1',
      leaveType: LeaveType.SICK,
    });
  });
});
