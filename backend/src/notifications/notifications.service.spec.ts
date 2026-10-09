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
});
