import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

// Pruebas e2e de la capa HTTP de edición de series (PROMPT 10) que NO
// requieren una base de datos real: rechazo por falta de autenticación,
// evaluado ANTES de llegar a Prisma. El resto de la matriz (IDOR, ventana de
// 24 horas) se prueba como pruebas unitarias con PrismaService mockeado —
// ver set-logs.service.spec.ts.
const CUID = 'ckv6q8x9z0000qzrmn831p6k';

describe('Edición de series - SetLog (e2e) - validación HTTP sin base de datos', () => {
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

  it('PATCH /set-logs/:id sin token responde 401', () => {
    return request(app.getHttpServer())
      .patch(`/api/v1/set-logs/${CUID}`)
      .send({ actualReps: 12 })
      .expect(401);
  });
});
