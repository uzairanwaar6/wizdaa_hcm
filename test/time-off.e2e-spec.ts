import { AddressInfo } from 'net';
import { Server } from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { LeaveType } from '../src/common/enums/leave-type.enum';
import { TimeOffStatus } from '../src/common/enums/time-off-status.enum';
import { HcmMockStore } from './mocks/hcm-mock.store';
import { startHcmMockServer } from './mocks/hcm-mock-server';

const LOC = 'loc-nyc';
const VAC = LeaveType.VACATION;

describe('Time-Off API (e2e, against mock HCM)', () => {
  let app: INestApplication;
  let http: Server;
  let hcmServer: Server;
  let store: HcmMockStore;

  beforeAll(async () => {
    store = new HcmMockStore();
    hcmServer = await startHcmMockServer(store, 0);
    const port = (hcmServer.address() as AddressInfo).port;

    process.env.HCM_BASE_URL = `http://localhost:${port}`;
    process.env.HCM_TIMEOUT_MS = '2000';
    process.env.DB_PATH = ':memory:';
    process.env.DB_SYNCHRONIZE = 'true';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => hcmServer.close(() => resolve()));
  });

  beforeEach(() => {
    store.mode = 'normal';
  });

  function seed(employeeId: string, availableDays: number, entitledDays = 20): void {
    store.seed({ employeeId, locationId: LOC, leaveType: VAC, entitledDays, availableDays });
  }

  function createBody(employeeId: string, start: string, end: string, extra: object = {}) {
    return {
      employeeId,
      locationId: LOC,
      leaveType: VAC,
      startDate: start,
      endDate: end,
      ...extra,
    };
  }

  function getBalance(employeeId: string) {
    return request(http).get(`/balances/${employeeId}/${LOC}/${VAC}`);
  }

  it('files a request (reserving against HCM), then approval commits it', async () => {
    seed('e-life', 10);

    const created = await request(http)
      .post('/time-off-requests')
      .send(createBody('e-life', '2026-07-01', '2026-07-02'))
      .expect(201);
    expect(created.body.status).toBe(TimeOffStatus.PENDING);
    const id = created.body.id;

    let bal = await getBalance('e-life').expect(200);
    expect(bal.body.availableDays).toBe(8);
    expect(bal.body.pendingDays).toBe(2);
    expect(store.getBalance('e-life', LOC, VAC)?.availableDays).toBe(8);

    const approved = await request(http)
      .post(`/time-off-requests/${id}/approve`)
      .send({ managerId: 'mgr-1' })
      .expect(200);
    expect(approved.body.status).toBe(TimeOffStatus.APPROVED);

    bal = await getBalance('e-life').expect(200);
    expect(bal.body.availableDays).toBe(8);
    expect(bal.body.pendingDays).toBe(0);
  });

  it('defensively rejects when the local balance is insufficient (422)', async () => {
    seed('e-def', 1);
    await request(http)
      .post('/time-off-requests')
      .send(createBody('e-def', '2026-07-01', '2026-07-02'))
      .expect(422);
  });

  it('rejects an invalid employee/location/leaveType combination (422)', async () => {
    await request(http)
      .post('/time-off-requests')
      .send(createBody('e-unknown', '2026-07-01', '2026-07-02'))
      .expect(422);
  });

  it('lets HCM authority catch insufficiency the stale local cache missed (422)', async () => {
    seed('e-auth', 10);
    await request(http)
      .post('/sync/refresh')
      .send({ employeeId: 'e-auth', locationId: LOC, leaveType: VAC })
      .expect(200);
    seed('e-auth', 1);
    await request(http)
      .post('/time-off-requests')
      .send(createBody('e-auth', '2026-07-01', '2026-07-02'))
      .expect(422);
  });

  it('fails closed with 503 when HCM is unavailable', async () => {
    seed('e-out', 10);
    await request(http)
      .post('/sync/refresh')
      .send({ employeeId: 'e-out', locationId: LOC, leaveType: VAC })
      .expect(200);
    store.mode = 'outage';
    await request(http)
      .post('/time-off-requests')
      .send(createBody('e-out', '2026-07-01', '2026-07-01'))
      .expect(503);
  });

  it('replays idempotently: same key reserves only once', async () => {
    seed('e-idem', 10);
    const first = await request(http)
      .post('/time-off-requests')
      .send(createBody('e-idem', '2026-07-01', '2026-07-02', { idempotencyKey: 'k-1' }))
      .expect(201);

    const replay = await request(http)
      .post('/time-off-requests')
      .send(createBody('e-idem', '2026-07-01', '2026-07-02', { idempotencyKey: 'k-1' }))
      .expect(201);

    expect(replay.body.id).toBe(first.body.id);
    const bal = await getBalance('e-idem').expect(200);
    expect(bal.body.availableDays).toBe(8);
    expect(bal.body.pendingDays).toBe(2);
  });

  it('releases the reservation (HCM + local) when a request is rejected', async () => {
    seed('e-rej', 10);
    const created = await request(http)
      .post('/time-off-requests')
      .send(createBody('e-rej', '2026-07-01', '2026-07-02'))
      .expect(201);

    await request(http)
      .post(`/time-off-requests/${created.body.id}/reject`)
      .send({ managerId: 'mgr-1', reason: 'no coverage' })
      .expect(200);

    const bal = await getBalance('e-rej').expect(200);
    expect(bal.body.availableDays).toBe(10);
    expect(bal.body.pendingDays).toBe(0);
    expect(store.getBalance('e-rej', LOC, VAC)?.availableDays).toBe(10);
  });

  it('restores the balance when an approved request is cancelled', async () => {
    seed('e-can', 10);
    const created = await request(http)
      .post('/time-off-requests')
      .send(createBody('e-can', '2026-07-01', '2026-07-03'))
      .expect(201);
    await request(http)
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({ managerId: 'mgr-1' })
      .expect(200);

    await request(http)
      .post(`/time-off-requests/${created.body.id}/cancel`)
      .send({ reason: 'plans changed' })
      .expect(200);

    const bal = await getBalance('e-can').expect(200);
    expect(bal.body.availableDays).toBe(10);
  });

  it('absorbs an independent HCM anniversary bonus on sync, preserving pending', async () => {
    seed('e-anniv', 5);
    await request(http)
      .post('/time-off-requests')
      .send(createBody('e-anniv', '2026-07-01', '2026-07-02'))
      .expect(201);

    store.applyAnniversary('e-anniv', LOC, VAC, 10);
    await request(http).post('/sync/batch').send().expect(200);

    const bal = await getBalance('e-anniv').expect(200);
    expect(bal.body.availableDays).toBe(13);
    expect(bal.body.pendingDays).toBe(2);
  });

  it('returns a consistent 400 envelope for an invalid body', async () => {
    const res = await request(http)
      .post('/time-off-requests')
      .send({ employeeId: '', leaveType: 'MAGIC', startDate: 'nope' })
      .expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, path: '/time-off-requests' });
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  it('ingests a pushed HCM corpus via POST /sync/import and reconciles the cache', async () => {
    const res = await request(http)
      .post('/sync/import')
      .send({
        balances: [
          {
            employeeId: 'e-push',
            locationId: LOC,
            leaveType: VAC,
            entitledDays: 30,
            availableDays: 18,
            sourceUpdatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      })
      .expect(200);
    expect(res.body).toEqual({ processed: 1, updated: 1 });

    const bal = await getBalance('e-push').expect(200);
    expect(bal.body.availableDays).toBe(18);
    expect(bal.body.entitledDays).toBe(30);
  });

  it('rejects an empty import payload with 400', async () => {
    await request(http).post('/sync/import').send({ balances: [] }).expect(400);
  });
});
