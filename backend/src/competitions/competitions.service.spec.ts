import { CompetitionType, Role } from '@prisma/client';
import { CompetitionsService } from './competitions.service';
import { PrismaService } from '../prisma/prisma.service';
import { StudentAccessService } from '../coaching/student-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

const student: AuthenticatedUser = {
  id: 'student-1',
  role: Role.STUDENT,
  email: 'student@example.com',
  name: 'Student',
  coachId: 'coach-1',
};

function setup() {
  const transaction = {
    competition: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    competition: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const access = {
    require: jest.fn().mockResolvedValue({
      id: student.id,
      name: student.name,
      coachId: student.coachId,
    }),
  };
  const notifications = { create: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new CompetitionsService(
    prisma as unknown as PrismaService,
    access as unknown as StudentAccessService,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditService,
  );
  return { service, prisma, transaction };
}

describe('CompetitionsService classification', () => {
  it('persiste el tipo al crear y al editar un hito', async () => {
    const { service, prisma, transaction } = setup();
    transaction.competition.create.mockResolvedValue({
      id: 'competition-1',
      studentId: student.id,
      type: CompetitionType.SPORTS,
    });

    await service.create(student, {
      name: 'Torneo local',
      eventDate: '2026-11-20',
      category: 'Open',
      type: CompetitionType.SPORTS,
    });

    expect(transaction.competition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: CompetitionType.SPORTS }),
      }),
    );

    prisma.competition.findFirst.mockResolvedValue({
      id: 'competition-1',
      studentId: student.id,
      type: CompetitionType.SPORTS,
    });
    transaction.competition.update.mockResolvedValue({
      id: 'competition-1',
      studentId: student.id,
      type: CompetitionType.MEDICAL,
    });

    await service.update(student, 'competition-1', {
      type: CompetitionType.MEDICAL,
    });

    expect(transaction.competition.update).toHaveBeenCalledWith({
      where: { id: 'competition-1' },
      data: expect.objectContaining({ type: CompetitionType.MEDICAL }),
    });
  });

  it('devuelve hitos históricos sin clasificación sin modificarlos', async () => {
    const { service, prisma } = setup();
    prisma.competition.findMany.mockResolvedValue([
      {
        id: 'legacy-competition',
        studentId: student.id,
        name: 'Hito histórico',
        type: null,
      },
    ]);

    const result = await service.list(student, student.id, 1);

    expect(result).toEqual([
      expect.objectContaining({ id: 'legacy-competition', type: null }),
    ]);
    expect(prisma.competition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: student.id } }),
    );
  });
});
