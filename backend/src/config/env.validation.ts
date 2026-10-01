import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  ALLOWED_ORIGIN: string = 'http://localhost:5173';

  // Obligatoria desde PROMPT 05: el modelo de datos ya está completamente
  // implementado (PROMPT 02) y toda la autenticación (PROMPT 03) y gestión
  // de alumnos (PROMPT 04) dependen de Postgres — arrancar sin esta
  // variable ya no tiene ningún caso de uso real, así que dejarla opcional
  // solo escondería un error de configuración hasta la primera consulta.
  // `PrismaService` sigue conectando de forma perezosa (ver
  // prisma/prisma.service.ts): esto solo valida que la variable EXISTA al
  // arrancar, no fuerza una conexión eager. Las pruebas e2e (que no hacen
  // ninguna consulta real) definen un valor de relleno en
  // `test/jest.setup.ts`, igual que ya hacían con los secretos JWT.
  @IsString()
  DATABASE_URL: string;

  // -------------------------------------------------------------------
  // Autenticación (PROMPT 03, ver docs/security.md puntos 1 y 12).
  // -------------------------------------------------------------------

  // Secretos de firma JWT. Deliberadamente OBLIGATORIOS (sin valor por
  // defecto): un secreto por defecto hardcodeado terminaría usándose por
  // descuido en un ambiente real. Las pruebas automatizadas los definen en
  // `test/jest.setup.ts` (para e2e) o mockean por completo el servicio de
  // tokens (para unit tests), nunca dependen de un valor por defecto aquí.
  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  // Formato aceptado por `@nestjs/jwt` / `ms` (ej. "15m", "7d").
  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  // Vigencia del token de invitación de alumno (horas).
  @IsInt()
  @Min(1)
  @IsOptional()
  INVITATION_EXPIRES_IN_HOURS: number = 168; // 7 días

  // Rate limiting reforzado para endpoints de autenticación (docs/security.md
  // punto 11). Configurable por ambiente para no sobre-limitar en desarrollo
  // local, y poder endurecerlo en demo/producción sin tocar código.
  @IsInt()
  @Min(1)
  @IsOptional()
  AUTH_THROTTLE_TTL_MS: number = 60000;

  @IsInt()
  @Min(1)
  @IsOptional()
  AUTH_THROTTLE_LIMIT: number = 10;

  @IsString()
  SMTP_HOST: string = 'smtp-relay.brevo.com';

  @IsInt()
  @Min(587)
  @Max(587)
  SMTP_PORT: number = 587;

  @IsString()
  SMTP_SECURE: string = 'false';

  @IsString()
  SMTP_USER: string = '';

  @IsString()
  SMTP_PASSWORD: string = '';

  @IsString()
  EMAIL_FROM: string = '';

  @IsString()
  EMAIL_FROM_NAME: string = 'Proyecto AAA';

  @IsString()
  FRONTEND_URL: string = 'http://localhost:5173';

  @IsInt()
  @Min(1)
  @Max(1440)
  PASSWORD_RESET_EXPIRES_IN_MINUTES: number = 30;
}

// Valida las variables de entorno al arrancar la aplicación para fallar rápido
// si falta alguna configuración obligatoria, en vez de fallar más tarde en
// tiempo de ejecución con un error menos claro.
export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    validationError: { target: false, value: false },
  });

  if (errors.length > 0) {
    throw new Error(
      `Configuración de entorno inválida: ${errors.map((error) => error.property).join(', ')}`,
    );
  }
  if (validatedConfig.SMTP_SECURE !== 'false')
    throw new Error('SMTP_SECURE debe ser false para STARTTLS en puerto 587');
  let frontend: URL;
  try {
    frontend = new URL(validatedConfig.FRONTEND_URL);
  } catch {
    throw new Error('FRONTEND_URL inválida');
  }
  if (
    !['http:', 'https:'].includes(frontend.protocol) ||
    frontend.username ||
    frontend.password ||
    frontend.search ||
    frontend.hash
  )
    throw new Error('FRONTEND_URL inválida');
  if (
    validatedConfig.NODE_ENV === Environment.Production &&
    frontend.protocol !== 'https:'
  )
    throw new Error('FRONTEND_URL debe utilizar HTTPS en producción');
  if (validatedConfig.NODE_ENV !== Environment.Test) {
    for (const key of [
      'SMTP_USER',
      'SMTP_PASSWORD',
      'EMAIL_FROM',
      'EMAIL_FROM_NAME',
    ] as const) {
      if (!validatedConfig[key]?.trim())
        throw new Error(`Falta variable de correo: ${key}`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validatedConfig.EMAIL_FROM))
      throw new Error('EMAIL_FROM inválido');
    if (!/^[a-zA-Z0-9.-]+$/.test(validatedConfig.SMTP_HOST))
      throw new Error('SMTP_HOST debe ser un nombre de servidor sin protocolo');
  }
  return validatedConfig;
}
