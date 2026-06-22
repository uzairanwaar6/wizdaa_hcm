import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('reports ok status with service name', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('timeoff-microservice');
    expect(typeof result.timestamp).toBe('string');
  });
});
