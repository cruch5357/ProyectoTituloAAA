import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { validateEnv } from './config/env.validation';
import { AUTH_THROTTLER_NAME } from './auth/auth.constants';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Límite general por IP ("default") + límite reforzado nombrado "auth"
    // para los endpoints sensibles de autenticación (docs/security.md,
    // punto 11), configurable por ambiente vía variables de entorno para no
    // sobre-limitar en desarrollo local.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: 60000,
          limit: 100,
        },
        {
          name: AUTH_THROTTLER_NAME,
          ttl: config.get<number>('AUTH_THROTTLE_TTL_MS') ?? 60000,
          limit: config.get<number>('AUTH_THROTTLE_LIMIT') ?? 10,
        },
      ],
    }),
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
