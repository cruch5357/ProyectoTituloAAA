import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password/password.service';
import { TokenService } from './tokens/token.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { createHash } from 'crypto';

describe('Password recovery', () => {
  const user = {
    id: 'u1',
    email: 'user@example.com',
    isActive: true,
    passwordHash: '',
    role: 'COACH',
    tokenVersion: 0,
  };
  let prisma: any;
  let mail: any;
  let service: AuthService;
  let passwords: PasswordService;
  let row: any;
  beforeEach(() => {
    row = {
      id: 'r1',
      userId: user.id,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60000),
    };
    prisma = {
      $queryRaw: jest.fn(),
      user: {
        findUnique: jest.fn().mockImplementation(async () => ({ ...user })),
        update: jest.fn().mockImplementation(async ({ data }) => {
          user.passwordHash = data.passwordHash;
        }),
      },
      passwordResetToken: {
        findUnique: jest.fn().mockImplementation(async () => ({ ...row })),
        create: jest.fn(),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          if (where.id && row.usedAt) return { count: 0 };
          if (where.id) row.usedAt = data.usedAt;
          return { count: 1 };
        }),
      },
      refreshSession: { updateMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };
    mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
    passwords = new PasswordService();
    const tokens = {
      generateRefreshToken: () => ({
        token: 'opaque-secret',
        tokenHash: 'hash-only',
      }),
      hashOpaqueToken: (value: string) =>
        createHash('sha256').update(value).digest('hex'),
      signAccessToken: () => 'access',
      getRefreshTokenExpiresAt: () => new Date(Date.now() + 60000),
    };
    service = new AuthService(
      prisma as PrismaService,
      passwords,
      tokens as unknown as TokenService,
      { record: jest.fn() } as unknown as AuditService,
      mail as MailService,
      new ConfigService({ PASSWORD_RESET_EXPIRES_IN_MINUTES: 30 }),
    );
  });

  it('returns the same message for existing, missing, inactive and SMTP-failure cases; stores only hash', async () => {
    const existing = await service.forgotPassword('USER@example.com');
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        tokenHash: 'hash-only',
        expiresAt: expect.any(Date),
      },
    });
    expect(mail.sendPasswordReset).toHaveBeenCalledWith(
      user.email,
      'opaque-secret',
      expect.any(Date),
    );
    mail.sendPasswordReset.mockRejectedValue(new Error('SMTP secret detail'));
    expect(await service.forgotPassword(user.email)).toEqual(existing);
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await service.forgotPassword('missing@example.com')).toEqual(
      existing,
    );
    prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    expect(await service.forgotPassword(user.email)).toEqual(existing);
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(existing)).not.toMatch(
      /opaque-secret|hash-only|SMTP/,
    );
  });

  it.each(['missing', 'expired', 'used', 'inactive'])(
    'rejects %s token/account',
    async (state) => {
      if (state === 'missing')
        prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      if (state === 'expired') row.expiresAt = new Date(0);
      if (state === 'used') row.usedAt = new Date();
      if (state === 'inactive')
        prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
      await expect(
        service.resetPassword({
          token: 'token',
          newPassword: 'NewPassword123',
        }),
      ).rejects.toThrow('Enlace inválido');
      expect(prisma.user.update).not.toHaveBeenCalled();
    },
  );

  it('changes the real Argon2 password, revokes sessions and rejects token reuse', async () => {
    user.passwordHash = await passwords.hashPassword('OldPassword123');
    await service.resetPassword({
      token: 'token',
      newPassword: 'NewPassword123',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: {
        passwordHash: expect.any(String),
        tokenVersion: { increment: 1 },
      },
    });
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    await expect(
      service.login({ email: user.email, password: 'OldPassword123' }, {}),
    ).rejects.toThrow('Credenciales inválidas');
    expect(
      (
        await service.login(
          { email: user.email, password: 'NewPassword123' },
          {},
        )
      ).accessToken,
    ).toBe('access');
    await expect(
      service.resetPassword({
        token: 'token',
        newPassword: 'AnotherPassword123',
      }),
    ).rejects.toThrow('Enlace inválido');
  });

  it('rejects a concurrent reset after the atomic claim was lost', async () => {
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.resetPassword({ token: 'token', newPassword: 'NewPassword123' }),
    ).rejects.toThrow('Enlace inválido');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
