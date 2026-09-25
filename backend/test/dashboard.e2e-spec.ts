import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

// Pruebas e2e de la capa HTTP del Dashboard del Coach (PROMPT 12, RF-26) que
// NO requieren una base de datos real: rechazo por falta de autenticación,
// evaluado ANTES de llegar a Prisma -- mismo criterio exacto que
// test/workout-logs.e2e-spec.ts (PROMPT 10/11). El resto de la matriz
// (aislamiento entre coaches, cálculo de métricas, 404 sobre alumno ajeno)
// se prueba como pruebas unitarias con PrismaService/StudentsService
// mockeados -- ver dashboard-summary.service.spec.ts y
// dashboard-student.service.spec.ts.
const CUID = 'ckv6q8x9z0000qzrmn831p6k';

describe('Dashboard del Coach (e2e) - validación HTTP sin base de datos', () => {
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

  it('GET /dashboard/summary sin token responde 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .expect(401);
  });

  it('GET /dashboard/recent-activity sin token responde 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/dashboard/recent-activity')
      .expect(401);
  });

  it(`GET /dashboard/students/${CUID} sin token responde 401`, () => {
    return request(app.getHttpServer())
      .get(`/api/v1/dashboard/students/${CUID}`)
      .expect(401);
  });

  it('GET /dashboard/students/:studentId con id de formato inválido responde 401 antes que 400 (falta el token primero)', () => {
    // JwtAuthGuard corre antes que la validación del DTO de ruta (mismo
    // orden que en el resto del proyecto -- ver StudentIdParamDto), así que
    // sin token la respuesta es 401 incluso con un id mal formado.
    return request(app.getHttpServer())
      .get('/api/v1/dashboard/students/id-invalido')
      .expect(401);
  });
});
