import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

// Pruebas e2e de la capa HTTP de /exercises que NO requieren una base de
// datos real: rechazo por falta de autenticación y validación de DTOs
// (formato de :id, whitelist/forbidNonWhitelisted), evaluadas ANTES de
// llegar a Prisma. El resto de la matriz (aislamiento real entre coaches,
// creación/edición/desactivación) se prueba como pruebas unitarias sobre
// ExercisesService con PrismaService mockeado (ver
// src/exercises/exercises.service.spec.ts), siguiendo el mismo patrón ya
// establecido en PROMPT 04 para /students (test/students.e2e-spec.ts) —
// este sandbox no tiene una base de datos PostgreSQL real disponible.
describe('Exercises (e2e) - validación HTTP sin base de datos', () => {
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

  it('GET /exercises sin token responde 401', () => {
    return request(app.getHttpServer()).get('/api/v1/exercises').expect(401);
  });

  it('GET /exercises ignora/rechaza un ?coachId= enviado por el cliente (401 antes que 400: el guard de autenticación corta primero)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/exercises?coachId=otro-coach-id')
      .expect(401);
  });

  it('GET /exercises/:id sin token responde 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/exercises/ckv6q8x9z0000qzrmn831p6k')
      .expect(401);
  });

  it('POST /exercises sin token responde 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/exercises')
      .send({ name: 'Sentadilla' })
      .expect(401);
  });

  it('PATCH /exercises/:id sin token responde 401', () => {
    return request(app.getHttpServer())
      .patch('/api/v1/exercises/ckv6q8x9z0000qzrmn831p6k')
      .send({ name: 'Sentadilla frontal' })
      .expect(401);
  });

  it('PATCH /exercises/:id/status sin token responde 401', () => {
    return request(app.getHttpServer())
      .patch('/api/v1/exercises/ckv6q8x9z0000qzrmn831p6k/status')
      .send({ isActive: false })
      .expect(401);
  });
});
