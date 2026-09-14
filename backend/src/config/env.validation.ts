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

  // Todavía no es estrictamente obligatorio: en esta etapa PrismaService no
  // se conecta de forma eager (ver prisma/prisma.service.ts). Cuando se
  // implemente el modelo de datos y se empiece a consultar la base de datos
  // real, esta variable debe pasar a ser obligatoria (quitar @IsOptional).
  @IsString()
  @IsOptional()
  DATABASE_URL?: string;
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
