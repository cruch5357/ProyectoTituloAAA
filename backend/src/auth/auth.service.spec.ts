import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password/password.service';
import { TokenService } from './tokens/token.service';

// NOTA (PROMPT 04): las pruebas de `inviteStudent` que vivían acá se
// movieron a `src/students/students.service.spec.ts`, junto con la
// reubicación de esa funcionalidad de AuthService a StudentsService
// (ver docs/api.md, "Estado de implementación (PROMPT 04)").
type MockPrisma = {
  user: Record<string, jest.Mock>;
  refreshSession: Record<string, jest.Mock>;
  studentInvitation: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function buildMockPrisma(): MockPrisma {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshSession: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    studentInvitation: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => fn(mockAsTx())),
  };
}

// El helper de arriba pasa el propio mock como "tx" dentro de $transaction,
// ya que en los tests no hay una base de datos real detrás.
function mockAsTx() {
  return prisma;
}

let prisma: MockPrisma;
let passwordService: jest.Mocked<PasswordService>;
let tokenService: jest.Mocked<TokenService>;
let auditService: jest.Mocked<AuditService>;
let service: AuthService;

const baseUser = {
  id: 'user-1',
  email: 'coach@example.com',
  passwordHash: 'hash-x',
  role: Role.COACH,
  name: 'Coach Uno',
  isActive: true,
  tokenVersion: 0,
  coachId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  prisma = buildMockPrisma();
  passwordService = {
    hashPassword: jest.fn().mockResolvedValue('hashed-password'),
    verifyPassword: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<PasswordService>;
  tokenService = {
    signAccessToken: jest.fn().mockReturnValue('access-token'),
    verifyAccessToken: jest.fn(),
    generateRefreshToken: jest
      .fn()
      .mockReturnValue({ token: 'raw-refresh', tokenHash: 'hash-refresh' }),
    generateInvitationToken: jest
      .fn()
      .mockReturnValue({ token: 'raw-invite', tokenHash: 'hash-invite' }),
    hashOpaqueToken: jest.fn((t: string) => `hash-of-${t}`),
    getRefreshTokenExpiresAt: jest
      .fn()
      .mockReturnValue(new Date(Date.now() + 1000 * 60 * 60)),
    getInvitationExpiresAt: jest
      .fn()
      .mockReturnValue(new Date(Date.now() + 1000 * 60 * 60)),
  } as unknown as jest.Mocked<TokenService>;
  auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditService>;

  service = new AuthService(
    prisma as unknown as PrismaService,
    passwordService,
    tokenService,
    auditService,
  );
});

describe('AuthService.register', () => {
  it('permite registrar un coach cuando el email no existe', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ ...baseUser });

    const result = await service.register({
      email: 'Coach@Example.com',
      password: 'ClaveValida123',
      name: 'Coach Uno',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'coach@example.com', // normalizado a minúsculas
        role: Role.COACH,
      }),
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.role).toBe(Role.COACH);
  });

  it('rechaza el registro si el email ya está en uso', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser });

    await expect(
      service.register({
        email: 'coach@example.com',
        password: 'ClaveValida123',
        name: 'Coach Uno',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('todo registro público crea siempre un usuario con rol COACH (un alumno nunca se autorregistra)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...baseUser, ...data }),
    );

    const result = await service.register({
      email: 'nuevo@example.com',
      password: 'ClaveValida123',
      name: 'Nuevo Coach',
    });

    expect(result.role).toBe(Role.COACH);
  });
});

describe('AuthService.login', () => {
  const meta = { ipAddress: '127.0.0.1', userAgent: 'jest' };

  it('login exitoso con credenciales correctas', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser });
    passwordService.verifyPassword.mockResolvedValue(true);
    prisma.refreshSession.create.mockResolvedValue({ id: 'rs-1' });

    const result = await service.login(
      { email: 'coach@example.com', password: 'ClaveValida123' },
      meta,
    );

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('raw-refresh');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(prisma.refreshSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });

  it('rechaza contraseña incorrecta con mensaje genérico', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser });
    passwordService.verifyPassword.mockResolvedValue(false);

    await expect(
      service.login(
        { email: 'coach@example.com', password: 'incorrecta' },
        meta,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un usuario inexistente con el MISMO mensaje genérico que una contraseña incorrecta', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    let messageForMissingUser = '';
    try {
      await service.login(
        { email: 'no-existe@example.com', password: 'cualquiera' },
        meta,
      );
    } catch (e) {
      messageForMissingUser = (e as UnauthorizedException).message;
    }

    prisma.user.findUnique.mockResolvedValue({ ...baseUser });
    passwordService.verifyPassword.mockResolvedValue(false);
    let messageForWrongPassword = '';
    try {
      await service.login(
        { email: 'coach@example.com', password: 'incorrecta' },
        meta,
      );
    } catch (e) {
      messageForWrongPassword = (e as UnauthorizedException).message;
    }

    expect(messageForMissingUser).toBe(messageForWrongPassword);
    expect(messageForMissingUser.length).toBeGreaterThan(0);
  });

  it('siempre ejecuta un verify de contraseña aunque el usuario no exista (mitigación de enumeración por temporización)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login(
        { email: 'no-existe@example.com', password: 'cualquiera' },
        meta,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(passwordService.verifyPassword).toHaveBeenCalled();
  });

  it('rechaza a un usuario inactivo aunque la contraseña sea correcta', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });
    passwordService.verifyPassword.mockResolvedValue(true);

    await expect(
      service.login(
        { email: 'coach@example.com', password: 'ClaveValida123' },
        meta,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('nunca registra la contraseña en los metadatos de auditoría', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser });
    passwordService.verifyPassword.mockResolvedValue(false);

    await expect(
      service.login(
        { email: 'coach@example.com', password: 'secreta-no-debe-aparecer' },
        meta,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    for (const call of auditService.record.mock.calls) {
      const serialized = JSON.stringify(call[0]);
      expect(serialized).not.toContain('secreta-no-debe-aparecer');
    }
  });
});

describe('AuthService.refresh', () => {
  const meta = { ipAddress: '127.0.0.1', userAgent: 'jest' };

  it('rota el refresh token cuando es válido y no ha sido usado', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'rs-old',
      userId: 'user-1',
      tokenHash: 'hash-of-raw-old',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: null,
      replacedById: null,
      userAgent: null,
      ipAddress: null,
      createdAt: new Date(),
    });
    prisma.user.findUnique.mockResolvedValue({ ...baseUser });
    prisma.refreshSession.create.mockResolvedValue({ id: 'rs-new' });

    const result = await service.refresh('raw-old', meta);

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('raw-refresh');
    expect(prisma.refreshSession.update).toHaveBeenCalledWith({
      where: { id: 'rs-old' },
      data: expect.objectContaining({ replacedById: 'rs-new' }),
    });
  });

  it('rechaza un refresh token que no existe', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue(null);
    await expect(
      service.refresh('token-inexistente', meta),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un refresh token expirado', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'rs-old',
      userId: 'user-1',
      tokenHash: 'hash-of-raw-old',
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      replacedById: null,
      userAgent: null,
      ipAddress: null,
      createdAt: new Date(),
    });

    await expect(service.refresh('raw-old', meta)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('detecta reuso: un refresh token ya rotado/revocado revoca TODAS las sesiones del usuario', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'rs-old',
      userId: 'user-1',
      tokenHash: 'hash-of-raw-old',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: new Date(), // ya fue rotado antes
      replacedById: 'rs-new',
      userAgent: null,
      ipAddress: null,
      createdAt: new Date(),
    });

    await expect(service.refresh('raw-old', meta)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.stringContaining('reuse') }),
    );
  });

  it('un refresh token viejo ya no funciona después de la rotación (reuso del mismo token dos veces)', async () => {
    const oldSession = {
      id: 'rs-old',
      userId: 'user-1',
      tokenHash: 'hash-of-raw-old',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: null as Date | null,
      replacedById: null as string | null,
      userAgent: null,
      ipAddress: null,
      createdAt: new Date(),
    };
    prisma.refreshSession.findUnique.mockImplementation(() =>
      Promise.resolve({ ...oldSession }),
    );
    prisma.user.findUnique.mockResolvedValue({ ...baseUser });
    prisma.refreshSession.create.mockResolvedValue({ id: 'rs-new' });
    prisma.refreshSession.update.mockImplementation(({ data }: any) => {
      Object.assign(oldSession, data);
      return Promise.resolve(oldSession);
    });

    // Primer uso: éxito, rota y marca revokedAt en la sesión vieja.
    await service.refresh('raw-old', meta);
    expect(oldSession.revokedAt).not.toBeNull();

    // Segundo uso del MISMO token viejo: debe fallar (reuso detectado).
    await expect(service.refresh('raw-old', meta)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('AuthService.logout', () => {
  it('revoca la sesión de refresh vigente', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'rs-1',
      userId: 'user-1',
      revokedAt: null,
    });

    await service.logout('raw-token');

    expect(prisma.refreshSession.update).toHaveBeenCalledWith({
      where: { id: 'rs-1' },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
  });

  it('es idempotente: no falla si no hay cookie o la sesión no existe', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue(null);
    await expect(service.logout(undefined)).resolves.toBeUndefined();
    await expect(service.logout('token-inexistente')).resolves.toBeUndefined();
  });
});

describe('AuthService.activate', () => {
  it('activa la cuenta con un token válido y no usado', async () => {
    prisma.studentInvitation.findUnique.mockResolvedValue({
      id: 'inv-1',
      email: 'alumno@example.com',
      coachId: 'coach-123',
      tokenHash: 'hash-of-valid-token',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      usedAt: null,
      createdAt: new Date(),
    });
    prisma.user.create.mockResolvedValue({
      ...baseUser,
      id: 'student-1',
      role: Role.STUDENT,
      coachId: 'coach-123',
      email: 'alumno@example.com',
    });

    const result = await service.activate({
      token: 'valid-token',
      name: 'Alumno Uno',
      password: 'ClaveValida123',
    });

    expect(result.role).toBe(Role.STUDENT);
    expect(result.coachId).toBe('coach-123');
  });

  it('rechaza un token inexistente/expirado/usado con el mismo mensaje genérico', async () => {
    prisma.studentInvitation.findUnique.mockResolvedValue(null);
    let messageNotFound = '';
    try {
      await service.activate({
        token: 'no-existe',
        name: 'X',
        password: 'ClaveValida123',
      });
    } catch (e) {
      messageNotFound = (e as UnauthorizedException).message;
    }

    prisma.studentInvitation.findUnique.mockResolvedValue({
      id: 'inv-1',
      email: 'a@example.com',
      coachId: 'c1',
      tokenHash: 'h',
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
      createdAt: new Date(),
    });
    let messageExpired = '';
    try {
      await service.activate({
        token: 'expirado',
        name: 'X',
        password: 'ClaveValida123',
      });
    } catch (e) {
      messageExpired = (e as UnauthorizedException).message;
    }

    prisma.studentInvitation.findUnique.mockResolvedValue({
      id: 'inv-1',
      email: 'a@example.com',
      coachId: 'c1',
      tokenHash: 'h',
      expiresAt: new Date(Date.now() + 1000 * 60),
      usedAt: new Date(),
      createdAt: new Date(),
    });
    let messageUsed = '';
    try {
      await service.activate({
        token: 'ya-usado',
        name: 'X',
        password: 'ClaveValida123',
      });
    } catch (e) {
      messageUsed = (e as UnauthorizedException).message;
    }

    expect(messageNotFound).toBe(messageExpired);
    expect(messageExpired).toBe(messageUsed);
    expect(messageNotFound.length).toBeGreaterThan(0);
  });
});
