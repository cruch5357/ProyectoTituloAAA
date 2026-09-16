import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

// Pruebas e2e de la capa HTTP de /auth y /users/me que NO requieren una
// base de datos real: validación de DTOs (whitelist/forbidNonWhitelisted) y
// rechazo por falta de autenticación, ambas evaluadas ANTES de llegar a
// Prisma. El resto de los casos del punto 27 de PROMPT 03 (login exitoso,
// rotación de refresh, detección de reuso, roles, etc.) se prueban como
// pruebas unitarias sobre AuthService/guards con PrismaService mockeado
// (ver src/auth/*.spec.ts), porque este sandbox no tiene una base de datos
// PostgreSQL real disponible (ver informe de PROMPT 03).
describe('Auth (e2e) - validación HTTP sin base de datos', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /auth/register rechaza una contraseña que no cumple la política mínima', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'a@a.com', password: 'corta', name: 'Ana' })
      .expect(400);
  });

  it('POST /auth/register rechaza campos no declarados en el DTO', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'a@a.com',
        password: 'ClaveValida123',
        name: 'Ana',
        role: 'COACH',
      })
      .expect(400);
  });

  it('POST /auth/login rechaza un email con formato inválido', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'no-es-email', password: 'x' })
      .expect(400);
  });

  it('GET /users/me sin token responde 401', () => {
    return request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  it('POST /auth/students/invite sin token responde 401 (endpoint protegido por rol)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/students/invite')
      .send({ email: 'alumno@example.com' })
      .expect(401);
  });

  it('POST /auth/refresh sin cookies responde 403 (falla la validación CSRF) o 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .expect((res) => {
        if (![401, 403].includes(res.status)) {
          throw new Error(`Se esperaba 401 o 403, se obtuvo ${res.status}`);
        }
      });
  });

  it('GET /users/me con un Bearer token con formato inválido responde 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer token-completamente-invalido')
      .expect(401);
  });
});
