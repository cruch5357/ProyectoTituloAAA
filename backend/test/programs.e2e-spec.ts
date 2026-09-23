import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

// Pruebas e2e de la capa HTTP de toda la jerarquia de prescripcion agregada
// en PROMPT 08 (programs, blocks, weeks, sessions, session-exercises) que NO
// requieren una base de datos real: rechazo por falta de autenticacion,
// evaluado ANTES de llegar a Prisma — mismo criterio y mismo alcance que
// test/exercises.e2e-spec.ts (PROMPT 07). El resto de la matriz (aislamiento
// real entre coaches a traves de toda la cadena, creacion/edicion/reorden)
// se prueba como pruebas unitarias con PrismaService mockeado (ver los
// *.service.spec.ts de cada modulo nuevo).
//
// Un id con formato valido de cuid basta para estas pruebas: el guard de
// autenticacion corta antes de que cualquier ValidationPipe o consulta a la
// base de datos se ejecute.
const CUID = 'ckv6q8x9z0000qzrmn831p6k';

describe('Programas/Bloques/Semanas/Sesiones (e2e) - validación HTTP sin base de datos', () => {
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

  describe('/programs', () => {
    it('GET /programs sin token responde 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/programs')
        .expect(401);
    });

    it('POST /programs sin token responde 401', () => {
      return request(app.getHttpServer())
        .post('/api/v1/programs')
        .send({ name: 'Programa X' })
        .expect(401);
    });

    it('GET /programs/:id sin token responde 401', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/programs/${CUID}`)
        .expect(401);
    });

    it('PATCH /programs/:id sin token responde 401', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/programs/${CUID}`)
        .send({ name: 'Programa Y' })
        .expect(401);
    });

    it('PATCH /programs/:id/status sin token responde 401', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/programs/${CUID}/status`)
        .send({ isActive: false })
        .expect(401);
    });
  });

  describe('/programs/:programId/blocks y /blocks/:id', () => {
    it('GET /programs/:programId/blocks sin token responde 401', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/programs/${CUID}/blocks`)
        .expect(401);
    });

    it('POST /programs/:programId/blocks sin token responde 401', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/programs/${CUID}/blocks`)
        .send({ name: 'Bloque 1' })
        .expect(401);
    });

    it('GET /blocks/:id sin token responde 401', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/blocks/${CUID}`)
        .expect(401);
    });

    it('PATCH /blocks/:id sin token responde 401', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/blocks/${CUID}`)
        .send({ order: 2 })
        .expect(401);
    });
  });

  describe('/blocks/:blockId/weeks y /weeks/:id', () => {
    it('GET /blocks/:blockId/weeks sin token responde 401', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/blocks/${CUID}/weeks`)
        .expect(401);
    });

    it('POST /blocks/:blockId/weeks sin token responde 401', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/blocks/${CUID}/weeks`)
        .send({ number: 1 })
        .expect(401);
    });

    it('GET /weeks/:id sin token responde 401', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/weeks/${CUID}`)
        .expect(401);
    });

    it('PATCH /weeks/:id sin token responde 401', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/weeks/${CUID}`)
        .send({ order: 2 })
        .expect(401);
    });
  });

  describe('/weeks/:weekId/sessions y /sessions/:id', () => {
    it('GET /weeks/:weekId/sessions sin token responde 401', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/weeks/${CUID}/sessions`)
        .expect(401);
    });

    it('POST /weeks/:weekId/sessions sin token responde 401', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/weeks/${CUID}/sessions`)
        .send({ name: 'Sesión A' })
        .expect(401);
    });

    it('GET /sessions/:id sin token responde 401', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/sessions/${CUID}`)
        .expect(401);
    });

    it('PATCH /sessions/:id sin token responde 401', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/sessions/${CUID}`)
        .send({ order: 2 })
        .expect(401);
    });
  });

  describe('/sessions/:sessionId/exercises y /session-exercises/:id', () => {
    it('GET /sessions/:sessionId/exercises sin token responde 401', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/sessions/${CUID}/exercises`)
        .expect(401);
    });

    it('POST /sessions/:sessionId/exercises sin token responde 401', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/sessions/${CUID}/exercises`)
        .send({ exerciseId: CUID })
        .expect(401);
    });

    it('GET /session-exercises/:id sin token responde 401', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/session-exercises/${CUID}`)
        .expect(401);
    });

    it('PATCH /session-exercises/:id sin token responde 401', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/session-exercises/${CUID}`)
        .send({ targetSets: 4 })
        .expect(401);
    });
  });
});
