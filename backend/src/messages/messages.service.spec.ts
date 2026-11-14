import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

describe('MessagesService', () => {
  it('crea una notificación destacada para una alerta de planificación', async () => {
    const tx = {
      message: {
        create: jest.fn().mockResolvedValue({
          id: 'message',
          body: '[TRAINING_PLAN_ALERT]\nReconsidera tu distribución',
          attachments: [],
        }),
      },
    };
    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'student', name: 'Atleta' }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
        ),
    };
    const notifications = { create: jest.fn() };
    const service = new MessagesService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      {} as StorageService,
      {} as AuditService,
    );
    const coach = {
      id: 'coach',
      email: 'coach@example.com',
      role: 'COACH',
      name: 'Coach',
      coachId: null,
    } satisfies AuthenticatedUser;

    await service.send(
      coach,
      'student',
      '[TRAINING_PLAN_ALERT]\nReconsidera tu distribución',
    );

    expect(notifications.create).toHaveBeenCalledWith(
      tx,
      'student',
      'TRAINING_PLAN_WARNING',
      'Alerta de planificación semanal',
      'message',
      'coach',
    );
  });
});
