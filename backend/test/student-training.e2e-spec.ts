import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

// Pruebas e2e de la capa HTTP de la navegación de solo lectura del Alumno
// (PROMPT 10) que NO requieren una base de datos real: rechazo por falta de
// autenticación, evaluado ANTES de llegar a Prisma — mismo criterio y mismo
// alcance que test/program-assignments.e2e-spec.ts (PROMPT 09). El resto de
// la matriz (IDOR por ProgramAssignment, cadenas de propiedad) se prueba
// como pruebas unitarias con PrismaService mockeado — ver
// student-training.service.spec.ts.
//
// Limitación de entorno persistente (docs/database.md/security.md, "Estado
// de implementación"): el puente de ejecución hacia la máquina real del
// equipo no puede correr ninguna prueba e2e con base de datos real (motor
// de Prisma generado para Windows vs. VM Linux del puente).
const CUID = 'ckv6q8x9z0000qzrmn831p6k';

describe('Navegación de solo lectura del Alumno (e2e) - validación HTTP sin base de datos', () => {
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

  it('GET /student/programs/:id sin token responde 401', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/student/programs/${CUID}`)
      .expect(401);
  });

  it('GET /student/programs/:id/blocks sin token responde 401', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/student/programs/${CUID}/blocks`)
      .expect(401);
  });

  it('GET /student/blocks/:id sin token responde 401', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/student/blocks/${CUID}`)
      .expect(401);
  });

  it('GET /student/blocks/:id/weeks sin token responde 401', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/student/blocks/${CUID}/weeks`)
      .expect(401);
  });

  it('GET /student/weeks/:id sin token responde 401', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/student/weeks/${CUID}`)
      .expect(401);
  });

  it('GET /student/weeks/:id/sessions sin token responde 401', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/student/weeks/${CUID}/sessions`)
      .expect(401);
  });

  it('GET /student/sessions/:id sin token responde 401', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/student/sessions/${CUID}`)
      .expect(401);
  });
});
