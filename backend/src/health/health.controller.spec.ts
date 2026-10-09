import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
describe('health', () => {
  const query = jest.fn();
  const controller = new HealthController({
    $queryRaw: query,
  } as unknown as PrismaService);
  it('preserves health and offers liveness without DB', () => {
    expect(controller.check().status).toBe('ok');
    expect(controller.live().status).toBe('ok');
    expect(query).not.toHaveBeenCalled();
  });
  it('readiness queries DB', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.ready()).resolves.toEqual({ status: 'ready' });
  });
  it('DB failure returns generic 503', async () => {
    query.mockRejectedValue(new Error('secret database URL'));
    await expect(controller.ready()).rejects.toMatchObject({
      status: 503,
      message: 'Aplicación no disponible',
    });
  });
});
