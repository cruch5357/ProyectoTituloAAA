import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { MailService } from '../src/mail/mail.service';

describe('Password recovery HTTP', () => {
  let app: INestApplication;
  const auth = {
    forgotPassword: jest
      .fn()
      .mockResolvedValue({ message: 'Respuesta genérica' }),
    resetPassword: jest.fn().mockResolvedValue({ message: 'OK' }),
  };
  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue(auth)
      .overrideProvider(MailService)
      .useValue({
        sendPasswordReset: jest.fn(),
        sendStudentInvitation: jest.fn(),
      })
      .compile();
    app = module.createNestApplication();
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
  it('validates email and rejects authority fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'invalid' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: 'opaque', newPassword: 'Password123', userId: 'victim' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: 'opaque', newPassword: 'short' })
      .expect(400);
    expect(auth.resetPassword).not.toHaveBeenCalled();
  });
  it('returns standard envelope and limits forgot requests to five per minute', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'user@example.com' })
        .expect(200);
      expect(response.body).toEqual({
        data: { message: 'Respuesta genérica' },
        error: null,
        meta: {},
      });
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'user@example.com' })
      .expect(429);
  });
  it('limits reset requests to ten per minute', async () => {
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'opaque', newPassword: 'Password123' })
        .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: 'opaque', newPassword: 'Password123' })
      .expect(429);
  });
});
