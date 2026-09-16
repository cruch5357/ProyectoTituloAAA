import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { InviteStudentDto } from './dto/invite-student.dto';
import { ActivateDto } from './dto/activate.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './guards/jwt-auth.guard';
import {
  AUTH_THROTTLER_NAME,
  CSRF_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
} from './auth.constants';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private getRequestMetadata(req: Request) {
    return {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }

  // Setea la cookie httpOnly del refresh token + la cookie legible de CSRF
  // (docs/security.md, puntos 1 y 9). Se usa en login y refresh.
  private setSessionCookies(
    res: Response,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): void {
    const maxAge = refreshExpiresAt.getTime() - Date.now();

    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'strict',
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge,
    });

    const csrfToken = randomBytes(32).toString('base64url');
    res.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false, // el frontend debe poder leerla para el header CSRF
      secure: this.isProduction(),
      sameSite: 'strict',
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge,
    });
  }

  private clearSessionCookies(res: Response): void {
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_TOKEN_COOKIE_PATH });
    res.clearCookie(CSRF_COOKIE, { path: REFRESH_TOKEN_COOKIE_PATH });
  }

  @Post('register')
  @Throttle({ [AUTH_THROTTLER_NAME]: {} })
  @ApiOperation({ summary: 'Registro público de Coach' })
  @ApiCreatedResponse({ description: 'Coach registrado' })
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    return { data: user, error: null, meta: {} };
  }

  @Post('students/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COACH)
  @ApiBearerAuth()
  @Throttle({ [AUTH_THROTTLER_NAME]: {} })
  @ApiOperation({ summary: 'Coach invita a un alumno por email' })
  async inviteStudent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: InviteStudentDto,
  ) {
    const result = await this.authService.inviteStudent(currentUser.id, dto);
    return { data: result, error: null, meta: {} };
  }

  @Post('activate')
  @Throttle({ [AUTH_THROTTLER_NAME]: {} })
  @ApiOperation({
    summary: 'Alumno activa su cuenta con el token de invitación',
  })
  async activate(@Body() dto: ActivateDto) {
    const user = await this.authService.activate(dto);
    return { data: user, error: null, meta: {} };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ [AUTH_THROTTLER_NAME]: {} })
  @ApiOperation({
    summary: 'Login: retorna access token y setea cookie de refresh',
  })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(
      dto,
      this.getRequestMetadata(req),
    );
    this.setSessionCookies(res, result.refreshToken, result.refreshExpiresAt);
    return {
      data: { accessToken: result.accessToken, user: result.user },
      error: null,
      meta: {},
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Renueva el access token usando la cookie de refresh (rotación)',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!rawToken) {
      this.clearSessionCookies(res);
      return {
        data: null,
        error: { code: 401, message: 'Sesión inválida o expirada' },
        meta: {},
      };
    }

    const result = await this.authService.refresh(
      rawToken,
      this.getRequestMetadata(req),
    );
    this.setSessionCookies(res, result.refreshToken, result.refreshExpiresAt);
    return {
      data: { accessToken: result.accessToken, user: result.user },
      error: null,
      meta: {},
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Invalida la sesión de refresh vigente' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    await this.authService.logout(rawToken);
    this.clearSessionCookies(res);
    return { data: { success: true }, error: null, meta: {} };
  }
}
