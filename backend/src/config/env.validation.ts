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
  });

  if (errors.length > 0) {
    throw new Error(`Configuración de entorno inválida: ${errors.toString()}`);
  }
  return validatedConfig;
}
