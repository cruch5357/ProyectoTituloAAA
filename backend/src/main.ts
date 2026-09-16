import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Headers de seguridad (docs/security.md, punto 15).
  app.use(helmet());

  // Necesario para leer la cookie de refresh token y la cookie CSRF
  // (docs/security.md, puntos 1 y 9; PROMPT 03).
  app.use(cookieParser());

  // CORS restringido al origen del frontend, nunca abierto (punto 10).
  // `credentials: true` es imprescindible para que el navegador envíe/reciba
  // la cookie de refresh en peticiones cross-site al frontend en otro
  // puerto/origen durante desarrollo; solo funciona junto a un origen
  // explícito (nunca con `*`), que es exactamente lo que ya se configura.
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

  // Documentación OpenAPI/Swagger (docs/api.md, principio 1; requisito
  // explícito de PROMPT 03). Solo documenta lo que ya existe: por ahora,
  // los endpoints de /auth y /users/me. Disponible en /api/v1/docs.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Plataforma de Gestión y Seguimiento de Entrenamiento — API')
    .setDescription(
      'Documentación de la API. Endpoints de autenticación (PROMPT 03); ' +
        'el resto de los dominios se agrega en prompts posteriores.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, swaggerDocument);

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port);
}
bootstrap();
