import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

// Pruebas e2e de la capa HTTP del registro de ejecución (PROMPT 10) que NO
// requieren una base de datos real: rechazo por falta de autenticación,
// evaluado ANTES de llegar a Prisma — mismo criterio que
// test/program-assignments.e2e-spec.ts (PROMPT 09). El resto de la matriz
// (IDOR de sesión/WorkoutLog, validaciones de reps/carga/RPE/RIR,
// operaciones incompatibles con el estado) se prueba como pruebas unitarias
// con PrismaService mockeado — ver workout-logs.service.spec.ts.
const CUID = 'ckv6q8x9z0000qzrmn831p6k';

describe('Registro de ejecución - WorkoutLog (e2e) - validación HTTP sin base de datos', () => {
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

  it('POST /sessions/:sessionId/workout-logs sin token responde 401', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/sessions/${CUID}/workout-logs`)
      .expect(401);
  });

  it('GET /sessions/:sessionId/workout-logs sin token responde 401', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/sessions/${CUID}/workout-logs`)
      .expect(401);
  });

  // PROMPT 11 (RF-25): historial y evolución agregadas al mismo controller
  // (/workout-logs), con el mismo guard de clase (JwtAuthGuard + Roles).
  it('GET /workout-logs (historial) sin token responde 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/workout-logs')
      .expect(401);
  });

  it('GET /workout-logs/evolution sin token responde 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/workout-logs/evolution')
      .expect(401);
  });

  it('GET /workout-logs/:id sin token responde 401', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/workout-logs/${CUID}`)
      .expect(401);
  });

  it('POST /workout-logs/:id/set-logs sin token responde 401', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/workout-logs/${CUID}/set-logs`)
      .send({ setLogs: [{ sessionExerciseId: CUID, setNumber: 1 }] })
      .expect(401);
  });

  it('PATCH /workout-logs/:id/finish sin token responde 401', () => {
    return request(app.getHttpServer())
      .patch(`/api/v1/workout-logs/${CUID}/finish`)
      .send({ completionStatus: 'COMPLETED', durationMinutes: 40 })
      .expect(401);
  });
});
