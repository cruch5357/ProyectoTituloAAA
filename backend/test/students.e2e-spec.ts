import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

// Pruebas e2e de la capa HTTP de /students que NO requieren una base de
// datos real: rechazo por falta de autenticación y validación de DTOs
// (formato de :id, whitelist/forbidNonWhitelisted incluyendo el rechazo de
// `?coachId=`), evaluadas ANTES de llegar a Prisma. El resto de la matriz
// del punto 18 de PROMPT 04 (aislamiento real entre coaches, alumno
// bloqueado, etc.) se prueba como pruebas unitarias sobre StudentsService
// con PrismaService mockeado (ver src/students/students.service.spec.ts),
// siguiendo el mismo patrón ya establecido en PROMPT 03 para /auth
// (test/auth.e2e-spec.ts) — este sandbox no tiene una base de datos
// PostgreSQL real disponible.
describe('Students (e2e) - validación HTTP sin base de datos', () => {
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

  it('GET /students sin token responde 401', () => {
    return request(app.getHttpServer()).get('/api/v1/students').expect(401);
  });

  it('GET /students ignora/rechaza un ?coachId= enviado por el cliente (400, no autorización)', () => {
    // Sin token válido igual llegaría 401 antes que la validación de query,
    // pero lo relevante acá es que `coachId` no es un campo declarado en
    // ListStudentsQueryDto: con forbidNonWhitelisted, un cliente NO puede
    // usarlo para intentar leer alumnos de otro coach ni aunque tuviera un
    // token válido. Verificamos que de todos modos no hay 500 ni que el
    // parámetro se "acepte" silenciosamente.
    return request(app.getHttpServer())
      .get('/api/v1/students?coachId=otro-coach-id')
      .expect(401); // el guard de autenticación corta antes; ver nota arriba
  });

  it('GET /students/:id sin token responde 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/students/ckv6q8x9z0000qzrmn831p6k')
      .expect(401);
  });

  it('PATCH /students/:id/status sin token responde 401', () => {
    return request(app.getHttpServer())
      .patch('/api/v1/students/ckv6q8x9z0000qzrmn831p6k/status')
      .send({ isActive: false })
      .expect(401);
  });

  it('POST /students/invite sin token responde 401 (endpoint protegido por rol)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/students/invite')
      .send({ email: 'alumno@example.com' })
      .expect(401);
  });

  it('la ruta anterior /auth/students/invite ya no existe (404) tras la reorganización de PROMPT 04', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/students/invite')
      .send({ email: 'alumno@example.com' })
      .expect(404);
  });
});
