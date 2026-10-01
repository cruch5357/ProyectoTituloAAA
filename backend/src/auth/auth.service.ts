import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password/password.service';
import { TokenService } from './tokens/token.service';
import { RegisterDto } from './dto/register.dto';
import { ActivateDto } from './dto/activate.dto';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PublicUser, toPublicUser } from '../common/mappers/public-user.mapper';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_REFRESH_SESSION,
  AUDIT_ENTITY_USER,
} from './auth.constants';

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: PublicUser;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: PublicUser;
}

// Hash Argon2id fijo y sin sentido, precalculado, usado únicamente para que
// `login()` siempre haga un verify() de costo equivalente aunque el email
// no exista, mitigando enumeración de usuarios por temporización
// (docs/security.md, punto 16: nunca revelar si la cuenta existe).
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const GENERIC_LOGIN_ERROR = 'Credenciales inválidas';
const GENERIC_INVITATION_ERROR = 'Token de invitación inválido o expirado';
const GENERIC_REFRESH_ERROR = 'Sesión inválida o expirada';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async forgotPassword(emailInput: string) {
    const result = {
      message:
        'Si existe una cuenta activa con ese correo, recibirás instrucciones para restablecer tu contraseña.',
    };
    const user = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(emailInput) },
    });
    if (!user?.isActive) return result;
    const { token, tokenHash } = this.tokenService.generateRefreshToken();
    const expiresAt = new Date(
      Date.now() +
        this.config.getOrThrow<number>('PASSWORD_RESET_EXPIRES_IN_MINUTES') *
          60000,
    );
    await this.prisma.$transaction(async (tx) => {
      // Serialize requests and resets for the same account.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
    });
    await this.auditService.record({
      actorId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: AUDIT_ENTITY_USER,
      entityId: user.id,
    });
    try {
      await this.mailService.sendPasswordReset(user.email, token, expiresAt);
    } catch {
      // Same public response for nonexistent, inactive and SMTP-failure cases.
      await this.auditService.record({
        actorId: user.id,
        action: 'PASSWORD_RESET_EMAIL_FAILED',
        entityType: AUDIT_ENTITY_USER,
        entityId: user.id,
      });
    }
    return result;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const invalid = () =>
      new UnauthorizedException(
        'Enlace inválido o expirado. Solicita uno nuevo.',
      );
    const tokenHash = this.tokenService.hashOpaqueToken(dto.token);
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now())
      throw invalid();
    const passwordHash = await this.passwordService.hashPassword(
      dto.newPassword,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${reset.userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: reset.userId } });
      if (!user?.isActive) throw invalid();
      const now = new Date();
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw invalid();
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.refreshSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    await this.auditService.record({
      actorId: reset.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: AUDIT_ENTITY_USER,
      entityId: reset.userId,
    });
    return {
      message:
        'Contraseña restablecida. Inicia sesión con tu nueva contraseña.',
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  // -------------------------------------------------------------------
  // Registro de Coach (público). Los alumnos nunca se autorregistran.
  // -------------------------------------------------------------------
  async register(dto: RegisterDto): Promise<PublicUser> {
    const email = this.normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // A diferencia del login, en el registro SÍ es información esperada
      // y necesaria para la UX que el email ya esté en uso (409 Conflict,
      // docs/api.md sección 5) — no es la misma situación de enumeración
      // de cuentas que en login, porque quien registra ya conoce su propio
      // email; no está sondeando la existencia de cuentas ajenas.
      throw new ConflictException('El email ya está en uso');
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: Role.COACH,
        name: dto.name,
      },
    });

    await this.auditService.record({
      actorId: user.id,
      action: AUDIT_ACTIONS.COACH_REGISTERED,
      entityType: AUDIT_ENTITY_USER,
      entityId: user.id,
    });

    return toPublicUser(user);
  }

  // -------------------------------------------------------------------
  // Activación de cuenta de alumno usando el token de invitación.
  // -------------------------------------------------------------------
  async activate(dto: ActivateDto): Promise<PublicUser> {
    const tokenHash = this.tokenService.hashOpaqueToken(dto.token);

    const invitation = await this.prisma.studentInvitation.findUnique({
      where: { tokenHash },
    });

    if (
      !invitation ||
      invitation.usedAt !== null ||
      invitation.expiresAt.getTime() < Date.now()
    ) {
      // Mismo error genérico sin importar la causa exacta (no encontrado,
      // ya usado, o expirado): no revela cuál de las tres ocurrió.
      throw new UnauthorizedException(GENERIC_INVITATION_ERROR);
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.studentInvitation.updateMany({
          where: {
            id: invitation.id,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1)
          throw new UnauthorizedException(GENERIC_INVITATION_ERROR);
        const createdUser = await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash,
            role: Role.STUDENT,
            name: dto.name,
            coachId: invitation.coachId,
          },
        });
        return createdUser;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe una cuenta asociada a este correo',
        );
      }
      throw error;
    }

    await this.auditService.record({
      actorId: user.id,
      action: AUDIT_ACTIONS.STUDENT_ACTIVATED,
      entityType: AUDIT_ENTITY_USER,
      entityId: user.id,
    });

    return toPublicUser(user);
  }

  // -------------------------------------------------------------------
  // Login: proceso de 10 pasos definido en PROMPT 03.
  // -------------------------------------------------------------------
  async login(dto: LoginDto, meta: RequestMetadata): Promise<LoginResult> {
    const email = this.normalizeEmail(dto.email); // 1-2: DTO ya validado, email normalizado
    const user = await this.prisma.user.findUnique({ where: { email } }); // 2

    const passwordToVerify = user?.passwordHash ?? DUMMY_PASSWORD_HASH; // 3-4: siempre se ejecuta un verify
    const passwordValid = await this.passwordService.verifyPassword(
      passwordToVerify,
      dto.password,
    ); // 5

    if (!user || !user.isActive || !passwordValid) {
      // 3-5 fallidos: mismo mensaje genérico, nunca revela cuál fue la causa
      // (docs/api.md sección 5; requisito explícito de PROMPT 03).
      await this.auditService.record({
        actorId: user?.id ?? null,
        action: AUDIT_ACTIONS.LOGIN_FAILURE,
        entityType: AUDIT_ENTITY_USER,
        entityId: user?.id ?? 'unknown',
        metadata: { email },
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const accessToken = this.tokenService.signAccessToken(user); // 6
    const { token: refreshToken, tokenHash } =
      this.tokenService.generateRefreshToken(); // 7
    const refreshExpiresAt = this.tokenService.getRefreshTokenExpiresAt();

    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: refreshExpiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    }); // 8: se persiste la nueva sesión de refresh

    await this.auditService.record({
      actorId: user.id,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entityType: AUDIT_ENTITY_USER,
      entityId: user.id,
    });

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt,
      user: toPublicUser(user), // 10: nunca passwordHash / refresh token en el JSON
    };
  }

  // -------------------------------------------------------------------
  // Refresh: rotación + detección básica de reuso.
  // -------------------------------------------------------------------
  async refresh(
    rawToken: string,
    meta: RequestMetadata,
  ): Promise<RefreshResult> {
    const tokenHash = this.tokenService.hashOpaqueToken(rawToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    if (session.revokedAt !== null) {
      // Reuso detectado: alguien presentó un refresh token que ya fue
      // rotado/revocado. Se asume compromiso y se revocan TODAS las
      // sesiones activas del usuario como medida defensiva
      // (docs/security.md, punto 12).
      await this.prisma.refreshSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // Además de revocar las RefreshSession, se incrementa tokenVersion
      // para que CUALQUIER access token ya emitido (aunque no haya
      // expirado, hasta 15 minutos) quede invalidado de inmediato en
      // JwtAuthGuard. Sin esto, revocar solo las RefreshSession no cumplía
      // la intención defensiva de "cerrar todas las sesiones" ante un
      // posible robo de refresh token.
      await this.prisma.user.update({
        where: { id: session.userId },
        data: { tokenVersion: { increment: 1 } },
      });
      await this.auditService.record({
        actorId: session.userId,
        action: AUDIT_ACTIONS.REFRESH_REUSE_DETECTED,
        entityType: AUDIT_ENTITY_REFRESH_SESSION,
        entityId: session.id,
      });
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    const accessToken = this.tokenService.signAccessToken(user);
    const { token: newRefreshToken, tokenHash: newTokenHash } =
      this.tokenService.generateRefreshToken();
    const refreshExpiresAt = this.tokenService.getRefreshTokenExpiresAt();

    const newSession = await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: newTokenHash,
        expiresAt: refreshExpiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), replacedById: newSession.id },
    });

    await this.auditService.record({
      actorId: user.id,
      action: AUDIT_ACTIONS.REFRESH_ROTATED,
      entityType: AUDIT_ENTITY_REFRESH_SESSION,
      entityId: newSession.id,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      refreshExpiresAt,
      user: toPublicUser(user),
    };
  }

  // -------------------------------------------------------------------
  // Logout: invalida la sesión de refresh vigente (idempotente).
  // -------------------------------------------------------------------
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }

    const tokenHash = this.tokenService.hashOpaqueToken(rawToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    if (!session || session.revokedAt !== null) {
      return;
    }

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    await this.auditService.record({
      actorId: session.userId,
      action: AUDIT_ACTIONS.LOGOUT,
      entityType: AUDIT_ENTITY_REFRESH_SESSION,
      entityId: session.id,
    });
  }
}
