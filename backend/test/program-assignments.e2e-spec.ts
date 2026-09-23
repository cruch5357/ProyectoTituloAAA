import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

// Pruebas e2e de la capa HTTP de la asignación de programas (PROMPT 09) que
// NO requieren una base de datos real: rechazo por falta de autenticación,
// evaluado ANTES de llegar a Prisma — mismo criterio y mismo alcance que
// test/programs.e2e-spec.ts (PROMPT 08) y test/exercises.e2e-spec.ts
// (PROMPT 07). El resto de la matriz (propiedad cruzada coach-coach,
// alumno-alumno, duplicados, alumno inactivo) se prueba como pruebas
// unitarias con PrismaService mockeado — ver program-assignments.service.spec.ts.
//
// Limitación de entorno persistente (ver docs/database.md/security.md,
// "Estado de implementación (PROMPT 08)"): el puente de ejecución hacia la
// máquina real del equipo no puede correr NINGUNA prueba e2e con base de
// datos real (motor de Prisma generado para Windows vs. VM Linux del
// puente). Estas pruebas, igual que las de programs.e2e-spec.ts, solo
// ejercitan el rechazo por falta de token, que ocurre antes de que
// PrismaService intente conectarse.
const CUID = 'ckv6q8x9z0000qzrmn831p6k';

describe('Asignación de programas (e2e) - validación HTTP sin base de datos', () => {
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

  describe('/programs/:programId/assign y /programs/:programId/assignments', () => {
    it('POST /programs/:programId/assign sin token responde 401', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/programs/${CUID}/assign`)
        .send({ studentId: CUID })
        .expect(401);
    });

    it('GET /programs/:programId/assignments sin token responde 401', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/programs/${CUID}/assignments`)
        .expect(401);
    });
  });

  describe('/program-assignments/:id, /program-assignments/:id/status y /program-assignments/me', () => {
    it('GET /program-assignments/:id sin token responde 401', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/program-assignments/${CUID}`)
        .expect(401);
    });

    it('PATCH /program-assignments/:id/status sin token responde 401', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/program-assignments/${CUID}/status`)
        .send({ status: 'FINISHED' })
        .expect(401);
    });

    it('GET /program-assignments/me sin token responde 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/program-assignments/me')
        .expect(401);
    });
  });
});
