import {
  ValidationPipe,
  BadRequestException,
  ArgumentMetadata,
} from '@nestjs/common';
import { RegisterDto } from './register.dto';

// Verifica el mismo pipeline de validación configurado globalmente en
// main.ts (whitelist + forbidNonWhitelisted + transform), aplicado
// directamente sobre RegisterDto, sin necesidad de levantar toda la app.
describe('RegisterDto (ValidationPipe global: whitelist + forbidNonWhitelisted)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata: ArgumentMetadata = { type: 'body', metatype: RegisterDto };

  it('acepta un payload válido', async () => {
    const result = await pipe.transform(
      { email: 'a@a.com', password: 'ClaveValida123', name: 'Ana' },
      metadata,
    );
    expect(result).toBeInstanceOf(RegisterDto);
  });

  it('rechaza una contraseña que no cumple la política mínima', async () => {
    await expect(
      pipe.transform(
        { email: 'a@a.com', password: 'corta', name: 'Ana' },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un email con formato inválido', async () => {
    await expect(
      pipe.transform(
        { email: 'no-es-un-email', password: 'ClaveValida123', name: 'Ana' },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza campos no declarados en el DTO (forbidNonWhitelisted)', async () => {
    await expect(
      pipe.transform(
        {
          email: 'a@a.com',
          password: 'ClaveValida123',
          name: 'Ana',
          role: 'COACH', // campo no declarado: nunca debe poder inyectarse
          isAdmin: true,
        },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
