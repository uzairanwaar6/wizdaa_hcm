import { LeaveType } from '../common/enums/leave-type.enum';
import { HcmRejectionError, HcmUnavailableError } from '../common/hcm/hcm-client.interface';
import { HttpHcmClient } from './hcm.service';

function configStub() {
  return {
    get: () => ({ baseUrl: 'http://hcm.test', apiKey: 'key', timeoutMs: 1000 }),
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

describe('HttpHcmClient', () => {
  let client: HttpHcmClient;
  let fetchMock: jest.Mock;

  const command = {
    employeeId: 'e1',
    locationId: 'l1',
    leaveType: LeaveType.VACATION,
    numberOfDays: 2,
    startDate: '2026-07-01',
    endDate: '2026-07-02',
    externalRef: 'r1',
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    client = new HttpHcmClient(configStub() as never);
  });

  it('getBalance returns the parsed snapshot on 200', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        employeeId: 'e1',
        locationId: 'l1',
        leaveType: LeaveType.VACATION,
        entitledDays: 20,
        availableDays: 8,
      }),
    );
    const snap = await client.getBalance('e1', 'l1', LeaveType.VACATION);
    expect(snap.availableDays).toBe(8);
  });

  it('postTimeOff resolves on 204', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204, undefined));
    await expect(client.postTimeOff(command)).resolves.toBeUndefined();
  });

  it('maps a 4xx insufficient-balance body to HcmRejectionError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, { error: 'INSUFFICIENT_BALANCE', message: 'no' }),
    );
    await expect(client.postTimeOff(command)).rejects.toBeInstanceOf(HcmRejectionError);
    await expect(client.postTimeOff(command)).rejects.toMatchObject({
      reason: 'INSUFFICIENT_BALANCE',
    });
  });

  it('maps a 5xx response to HcmUnavailableError', async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { error: 'DOWN' }));
    await expect(client.postTimeOff(command)).rejects.toBeInstanceOf(HcmUnavailableError);
  });

  it('maps a network failure to HcmUnavailableError', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(client.getBalance('e1', 'l1', LeaveType.VACATION)).rejects.toBeInstanceOf(
      HcmUnavailableError,
    );
  });
});
