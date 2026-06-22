import express, { Express, Request, Response } from 'express';
import { Server } from 'http';
import { LeaveType } from '../../src/common/enums/leave-type.enum';
import { HcmMockStore } from './hcm-mock.store';

export function createHcmMockApp(store: HcmMockStore): Express {
  const app = express();
  app.use(express.json());

  app.use((_req: Request, res: Response, next) => {
    if (store.mode === 'outage') {
      res.status(503).json({ error: 'HCM_UNAVAILABLE', message: 'HCM is temporarily down.' });
      return;
    }
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'hcm-mock' });
  });

  app.get('/balances/batch', (_req: Request, res: Response) => {
    res.json(store.batch());
  });

  app.get('/balances/:employeeId/:locationId/:leaveType', (req: Request, res: Response) => {
    const employeeId = String(req.params.employeeId);
    const locationId = String(req.params.locationId);
    const leaveType = String(req.params.leaveType) as LeaveType;
    const balance = store.getBalance(employeeId, locationId, leaveType);
    if (!balance) {
      res.status(404).json({ error: 'INVALID_DIMENSIONS', message: 'Unknown balance dimensions.' });
      return;
    }
    res.json(balance);
  });

  app.post('/time-off', (req: Request, res: Response) => {
    const result = store.file(req.body);
    if (result.ok) {
      res.status(204).send();
      return;
    }
    res.status(result.status ?? 422).json({ error: result.error, message: result.message });
  });

  app.post('/time-off/:externalRef/cancel', (req: Request, res: Response) => {
    store.cancel(String(req.params.externalRef));
    res.status(204).send();
  });

  return app;
}

export function startHcmMockServer(store: HcmMockStore, port: number): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHcmMockApp(store).listen(port, () => resolve(server));
  });
}

if (require.main === module) {
  const store = new HcmMockStore();
  store.seed({
    employeeId: 'emp-001',
    locationId: 'loc-nyc',
    leaveType: LeaveType.VACATION,
    entitledDays: 20,
    availableDays: 10,
  });
  store.seed({
    employeeId: 'emp-001',
    locationId: 'loc-nyc',
    leaveType: LeaveType.SICK,
    entitledDays: 10,
    availableDays: 8,
  });
  const port = Number.parseInt(process.env.HCM_MOCK_PORT ?? '4000', 10);
  startHcmMockServer(store, port).then(() => {
    console.log(`HCM mock server listening on http://localhost:${port}`);
  });
}
