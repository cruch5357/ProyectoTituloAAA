import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
describe('notification lifecycle', () => {
  it.each([true, false])(
    'creates operational notices only for active recipient (%s)',
    async (isActive) => {
      const tx: any = {
        user: { findUnique: jest.fn().mockResolvedValue({ isActive }) },
        notification: { create: jest.fn(), upsert: jest.fn() },
      };
      const service = new NotificationsService({} as PrismaService);
      await service.create(
        tx,
        'user',
        'NEW_MESSAGE',
        'Mensaje',
        'message',
        'id',
      );
      expect(tx.notification.create).toHaveBeenCalledTimes(isActive ? 1 : 0);
    },
  );
  it('reemplaza retroactivamente el id por el nombre en correcciones guardadas', async () => {
    const prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'notice',
            title: 'Solicitud de corrección de entrenamiento',
            body: 'c3b4b40520ff64090a3bc805c solicitó corregir Tren inferior',
            resourceType: 'message',
            resourceId: 'c3b4b40520ff64090a3bc805c',
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c3b4b40520ff64090a3bc805c', name: 'Alex Demo' },
        ]),
      },
    };
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
    );

    await expect(service.list('coach', 1)).resolves.toEqual([
      expect.objectContaining({
        body: 'Alex Demo solicitó corregir Tren inferior',
      }),
    ]);
  });
});
