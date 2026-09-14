import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Headers de seguridad (docs/security.md, punto 15).
  app.use(helmet());

  // CORS restringido al origen del frontend, nunca abierto (punto 10).
  app.enableCors({
    origin: configService.get<string>('ALLOWED_ORIGIN'),
    credentials: true,
  });

  // Toda la API vive bajo /api/v1 (docs/api.md).
  app.setGlobalPrefix('api/v1');

  // Validación de entrada estricta: rechaza campos no declarados en los DTOs
  // en vez de ignorarlos silenciosamente (punto 6 de docs/security.md).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Manejo de errores centralizado, sin exponer detalles internos al cliente.
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port);
}
bootstrap();
