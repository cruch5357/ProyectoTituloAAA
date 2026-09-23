import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { StudentsService } from './students.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/tokens/token.service';

type MockPrisma = {
  user: Record<string, jest.Mock>;
  studentInvitation: Record<string, jest.Mock>;
};

function buildMockPrisma(): MockPrisma {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    studentInvitation: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

let prisma: MockPrisma;
let tokenService: jest.Mocked<TokenService>;
let auditService: jest.Mocked<AuditService>;
let service: StudentsService;

const COACH_ID = 'coach-123';
const OTHER_COACH_ID = 'coach-999';

function buildStudent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'student-1',
    email: 'alumno@example.com',
    passwordHash: 'hash-x',
    role: Role.STUDENT,
    name: 'Alumno Uno',
    isActive: true,
    tokenVersion: 0,
    coachId: COACH_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  prisma = buildMockPrisma();
  tokenService = {
    generateInvitationToken: jest
      .fn()
      .mockReturnValue({ token: 'raw-invite', tokenHash: 'hash-invite' }),
    getInvitationExpiresAt: jest
      .fn()
      .mockReturnValue(new Date(Date.now() + 1000 * 60 * 60)),
  } as unknown as jest.Mocked<TokenService>;
  auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditService>;

  service = new StudentsService(
    prisma as unknown as PrismaService,
    tokenService,
    auditService,
  );
});

// ---------------------------------------------------------------------------
// GET /students — un coach solo obtiene sus propios alumnos (PROMPT 04,
// punto 18: "Coach obtiene solo sus propios alumnos").
// ---------------------------------------------------------------------------
describe('StudentsService.listForCoach', () => {
  it('filtra siempre por el coachId del usuario autenticado, nunca por uno de la query', async () => {
    prisma.user.findMany.mockResolvedValue([buildStudent()]);
    prisma.user.count.mockResolvedValue(1);

    await service.listForCoach(COACH_ID, { page: 1, limit: 20 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: Role.STUDENT,
          coachId: COACH_ID,
        }),
      }),
    );
    expect(prisma.user.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coachId: COACH_ID }),
      }),
    );
  });

  it('nunca expone passwordHash en los items devueltos', async () => {
    prisma.user.findMany.mockResolvedValue([buildStudent()]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.listForCoach(COACH_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.items[0]).not.toHaveProperty('passwordHash');
    expect(result.items[0]).not.toHaveProperty('tokenVersion');
  });

  it('aplica paginación (skip/take) según page y limit', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.listForCoach(COACH_ID, { page: 3, limit: 10 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('agrega búsqueda por nombre/email solo cuando se envía `search`', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.listForCoach(COACH_ID, {
      page: 1,
      limit: 20,
      search: 'ana',
    });

    const callArg = prisma.user.findMany.mock.calls[0][0];
    expect(callArg.where.OR).toEqual([
      { name: { contains: 'ana', mode: 'insensitive' } },
      { email: { contains: 'ana', mode: 'insensitive' } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// GET /students/:id — Coach puede ver el detalle de un alumno propio; Coach
// NO puede ver el detalle de un alumno de otro coach (PROMPT 04, punto 18).
// ---------------------------------------------------------------------------
describe('StudentsService.getOwnedByCoach', () => {
  it('retorna el alumno cuando pertenece al coach autenticado', async () => {
    prisma.user.findUnique.mockResolvedValue(buildStudent());

    const result = await service.getOwnedByCoach(COACH_ID, 'student-1');

    expect(result.id).toBe('student-1');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('lanza 404 (nunca 403) si el alumno pertenece a otro coach', async () => {
    prisma.user.findUnique.mockResolvedValue(
      buildStudent({ coachId: OTHER_COACH_ID }),
    );

    await expect(
      service.getOwnedByCoach(COACH_ID, 'student-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza 404 si el id no existe', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.getOwnedByCoach(COACH_ID, 'no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza 404 si el id corresponde a un COACH, no a un STUDENT', async () => {
    prisma.user.findUnique.mockResolvedValue(
      buildStudent({ role: Role.COACH, coachId: null }),
    );

    await expect(
      service.getOwnedByCoach(COACH_ID, 'student-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// PATCH /students/:id/status — Coach puede modificar el estado de un alumno
// propio; Coach NO puede modificar un alumno de otro coach; no se pueden
// modificar campos prohibidos vía este endpoint (PROMPT 04, puntos 7 y 18).
// ---------------------------------------------------------------------------
describe('StudentsService.updateStatus', () => {
  it('actualiza isActive cuando el alumno pertenece al coach autenticado', async () => {
    prisma.user.findUnique.mockResolvedValue(buildStudent({ isActive: true }));
    prisma.user.update.mockResolvedValue(buildStudent({ isActive: false }));

    const result = await service.updateStatus(COACH_ID, 'student-1', {
      isActive: false,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: { isActive: false },
    });
    expect(result.isActive).toBe(false);
  });

  it('el objeto `data` enviado a Prisma NUNCA incluye role/coachId/email/passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue(buildStudent());
    prisma.user.update.mockResolvedValue(buildStudent({ isActive: false }));

    await service.updateStatus(COACH_ID, 'student-1', {
      isActive: false,
      // @ts-expect-error -- simula un intento de mass assignment; el
      // servicio nunca reenvía el DTO completo a Prisma.
      role: Role.COACH,
      coachId: OTHER_COACH_ID,
    });

    const dataArg = prisma.user.update.mock.calls[0][0].data;
    expect(Object.keys(dataArg)).toEqual(['isActive']);
  });

  it('rechaza (404) intentar modificar un alumno de otro coach', async () => {
    prisma.user.findUnique.mockResolvedValue(
      buildStudent({ coachId: OTHER_COACH_ID }),
    );

    await expect(
      service.updateStatus(COACH_ID, 'student-1', { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('registra la acción en AuditLog sin incluir datos sensibles', async () => {
    prisma.user.findUnique.mockResolvedValue(buildStudent());
    prisma.user.update.mockResolvedValue(buildStudent({ isActive: false }));

    await service.updateStatus(COACH_ID, 'student-1', { isActive: false });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: COACH_ID,
        entityId: 'student-1',
        metadata: { isActive: false },
      }),
    );
    const metadataArg = (auditService.record as jest.Mock).mock.calls[0][0]
      .metadata;
    expect(JSON.stringify(metadataArg)).not.toMatch(/hash|password|token/i);
  });
});

// ---------------------------------------------------------------------------
// POST /students/invite — reubicado desde AuthService.inviteStudent()
// (PROMPT 03); mismas pruebas, movidas junto con el código.
// ---------------------------------------------------------------------------
describe('StudentsService.invite', () => {
  it('el coachId siempre viene del parámetro explícito, nunca del DTO', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.studentInvitation.create.mockResolvedValue({ id: 'inv-1' });

    const result = await service.invite(COACH_ID, {
      email: 'alumno@example.com',
    });

    expect(prisma.studentInvitation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ coachId: COACH_ID }),
    });
    expect(result.activationToken).toBe('raw-invite');
  });

  it('rechaza invitar un email que ya tiene cuenta', async () => {
    prisma.user.findUnique.mockResolvedValue(buildStudent());

    await expect(
      service.invite(COACH_ID, { email: 'alumno@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
