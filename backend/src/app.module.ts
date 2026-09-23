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
import { StudentsModule } from './students/students.module';
import { ExercisesModule } from './exercises/exercises.module';
import { ProgramsModule } from './programs/programs.module';
import { BlocksModule } from './blocks/blocks.module';
import { WeeksModule } from './weeks/weeks.module';
import { SessionsModule } from './sessions/sessions.module';
import { SessionExercisesModule } from './session-exercises/session-exercises.module';
import { ProgramAssignmentsModule } from './program-assignments/program-assignments.module';
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
    StudentsModule,
    ExercisesModule,
    ProgramsModule,
    BlocksModule,
    WeeksModule,
    SessionsModule,
    SessionExercisesModule,
    ProgramAssignmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
