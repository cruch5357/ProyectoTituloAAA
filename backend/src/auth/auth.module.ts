import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password/password.service';
import { TokenService } from './tokens/token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  // JwtModule se registra sin configuración global de secreto/expiración:
  // TokenService pasa `secret`/`expiresIn` explícitamente en cada llamada
  // (uno para access, y el refresh ni siquiera es un JWT), así que no hay
  // "el" secreto único del módulo que configurar acá.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, JwtAuthGuard],
  exports: [PasswordService, TokenService, JwtAuthGuard],
})
export class AuthModule {}
