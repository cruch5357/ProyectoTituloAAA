import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import { StorageService } from '../src/storage/storage.service';
import { todayDate } from '../src/common/training/calendar-date';

// Opt-in. Never resets the database; cleanup is restricted to users created here.
const suite = process.env.COACHING_E2E_DATABASE_URL ? describe : describe.skip;
suite('Coaching: flujo HTTP con PostgreSQL real', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ids: string[] = [];
  const storageKeys: string[] = [];
  const suffix = randomUUID();
  const password = `DemoOnly-${suffix}-1`;
  const mail = {
    sendStudentInvitation: jest.fn(),
    sendPasswordReset: jest.fn(),
  };
  let coachToken: string;
  let studentToken: string;
  let otherCoachToken: string;
  let otherStudentToken: string;
  let coachId: string;
  let studentId: string;
  let competitionId: string;
  let attachmentId: string;
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.COACHING_E2E_DATABASE_URL;
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    if (!prisma) return;
    const attachments = await prisma.messageAttachment.findMany({
      where: { message: { senderId: { in: ids } } },
      select: { storageKey: true },
    });
    storageKeys.push(...attachments.map((a) => a.storageKey));
    for (const key of storageKeys) await app.get(StorageService).delete(key);
    await prisma.message.deleteMany({
      where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] },
    });
    await prisma.workoutLog.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.program.deleteMany({ where: { coachId: { in: ids } } });
    await prisma.exercise.deleteMany({ where: { coachId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({
      where: { id: { in: ids }, role: 'STUDENT' },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids }, role: 'COACH' } });
    await app.close();
  });
  const api = () => request(app.getHttpServer());
  async function register(label: string) {
    const email = `${label}-${suffix}@example.com`;
    const result = await api()
      .post('/api/v1/auth/register')
      .send({ email, password, name: 'Coach prueba' })
      .expect(201);
    ids.push(result.body.data.id);
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      id: result.body.data.id as string,
      token: login.body.data.accessToken as string,
    };
  }
  async function invite(token: string, label: string) {
    const email = `${label}-${suffix}@example.com`;
    await api()
      .post('/api/v1/students/invite')
      .auth(token, { type: 'bearer' })
      .send({ email })
      .expect(201);
    const invitationToken = mail.sendStudentInvitation.mock.calls.at(-1)![1];
    const activated = await api()
      .post('/api/v1/auth/activate')
      .send({ token: invitationToken, password, name: 'Atleta prueba' })
      .expect(201);
    ids.push(activated.body.data.id);
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      id: activated.body.data.id as string,
      token: login.body.data.accessToken as string,
    };
  }
  it('registra Coach, invita alumno, asigna con fecha y muestra sesión real', async () => {
    const coach = await register('coach');
    coachId = coach.id;
    coachToken = coach.token;
    const student = await invite(coachToken, 'student');
    studentId = student.id;
    studentToken = student.token;
    const other = await register('other');
    otherCoachToken = other.token;
    otherStudentToken = (await invite(other.token, 'otherstudent')).token;
    const program = await api()
      .post('/api/v1/programs')
      .auth(coachToken, { type: 'bearer' })
      .send({ name: 'Programa E2E' })
      .expect(201);
    const block = await api()
      .post(`/api/v1/programs/${program.body.data.id}/blocks`)
      .auth(coachToken, { type: 'bearer' })
      .send({ name: 'Bloque E2E' })
      .expect(201);
    const week = await api()
      .post(`/api/v1/blocks/${block.body.data.id}/weeks`)
      .auth(coachToken, { type: 'bearer' })
      .send({ number: 1 })
      .expect(201);
    const today = todayDate();
    const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
    const session = await api()
      .post(`/api/v1/weeks/${week.body.data.id}/sessions`)
      .auth(coachToken, { type: 'bearer' })
      .send({ name: 'Sesión E2E', dayOfWeek })
      .expect(201);
    const assignment = await api()
      .post(`/api/v1/programs/${program.body.data.id}/assign`)
      .auth(coachToken, { type: 'bearer' })
      .send({ studentId, startDate: today })
      .expect(201);
    expect(assignment.body.data.startDate.slice(0, 10)).toBe(today);
    const calendar = await api()
      .get('/api/v1/calendar/me')
      .auth(studentToken, { type: 'bearer' })
      .expect(200);
    expect(calendar.body.data.nextSession.sessionId).toBe(session.body.data.id);
    expect(calendar.body.data.nextSession.date).toBe(today);
    const notifications = await api()
      .get('/api/v1/notifications')
      .auth(studentToken, { type: 'bearer' })
      .expect(200);
    expect(
      notifications.body.data.some(
        (n: { type: string }) => n.type === 'PROGRAM_ASSIGNED',
      ),
    ).toBe(true);
    const exercise = await prisma.exercise.create({
      data: { coachId, name: 'Bench original' },
    });
    const prescription = await prisma.sessionExercise.create({
      data: {
        sessionId: session.body.data.id,
        exerciseId: exercise.id,
        order: 1,
        targetSets: 3,
        targetRepsMin: 5,
        targetRepsMax: 5,
        targetRpe: 8,
        targetRir: 2,
        restSeconds: 120,
        notes: 'Prescripción A',
      },
    });
    const workout = await api()
      .post(`/api/v1/sessions/${session.body.data.id}/workout-logs`)
      .auth(studentToken, { type: 'bearer' })
      .send({})
      .expect(201);
    expect(workout.body.data.prescriptionSource).toBe('snapshot');
    await api()
      .post(`/api/v1/workout-logs/${workout.body.data.id}/set-logs`)
      .auth(studentToken, { type: 'bearer' })
      .send({
        setLogs: [
          {
            sessionExerciseId: prescription.id,
            setNumber: 1,
            actualReps: 5,
            actualLoad: 100,
          },
        ],
      })
      .expect(201);
    await api()
      .patch(`/api/v1/workout-logs/${workout.body.data.id}/finish`)
      .auth(studentToken, { type: 'bearer' })
      .send({ completionStatus: 'COMPLETED', durationMinutes: 30 })
      .expect(200);
    await api()
      .patch(`/api/v1/workout-logs/${workout.body.data.id}/finish`)
      .auth(studentToken, { type: 'bearer' })
      .send({ completionStatus: 'COMPLETED', durationMinutes: 31 })
      .expect(200);
    await prisma.sessionExercise.update({
      where: { id: prescription.id },
      data: {
        targetSets: 4,
        targetRepsMin: 4,
        targetRepsMax: 4,
        targetRpe: 9,
        notes: 'Prescripción B',
      },
    });
    const history = await api()
      .get(`/api/v1/workout-logs/${workout.body.data.id}`)
      .auth(studentToken, { type: 'bearer' })
      .expect(200);
    expect(history.body.data.setLogs[0].sessionExercise).toMatchObject({
      targetSets: 3,
      targetRepsMin: 5,
      targetRepsMax: 5,
      targetRpe: 8,
      notes: 'Prescripción A',
      exercise: { name: 'Bench original' },
    });
    await prisma.exercise.update({
      where: { id: exercise.id },
      data: { name: 'Bench renombrado' },
    });
    const renamed = await api()
      .get(`/api/v1/workout-logs/${workout.body.data.id}`)
      .auth(studentToken, { type: 'bearer' })
      .expect(200);
    expect(renamed.body.data.setLogs[0].sessionExercise.exercise.name).toBe(
      'Bench original',
    );
    expect(renamed.body.data.setLogs[0].actualLoad).toBe(100);
    expect(renamed.body.data.prescriptions).toHaveLength(1);
    const legacy = await prisma.workoutLog.create({
      data: {
        sessionId: session.body.data.id,
        studentId,
        completionStatus: 'COMPLETED',
        durationMinutes: 20,
        setLogs: {
          create: {
            sessionExerciseId: prescription.id,
            setNumber: 1,
            actualReps: 5,
          },
        },
      },
    });
    const legacyHistory = await api()
      .get(`/api/v1/workout-logs/${legacy.id}`)
      .auth(studentToken, { type: 'bearer' })
      .expect(200);
    expect(legacyHistory.body.data.prescriptionSource).toBe('legacy-current');
    expect(legacyHistory.body.data.setLogs[0].sessionExercise.targetSets).toBe(
      4,
    );
    expect(
      legacyHistory.body.data.setLogs[0].sessionExercise.exercise.name,
    ).toBe('Bench renombrado');
    expect(
      await prisma.notification.count({
        where: { userId: coachId, type: 'WORKOUT_COMPLETED' },
      }),
    ).toBe(1);
    await api()
      .patch(
        `/api/v1/program-assignments/${assignment.body.data.id}/start-date`,
      )
      .auth(otherCoachToken, { type: 'bearer' })
      .send({ startDate: today })
      .expect(404);
    await api()
      .patch(
        `/api/v1/program-assignments/${assignment.body.data.id}/start-date`,
      )
      .auth(coachToken, { type: 'bearer' })
      .send({ startDate: '2026-02-30' })
      .expect(400);
  });
  it('Competition end-to-end, ownership y objetivos separados', async () => {
    const created = await api()
      .post('/api/v1/competitions')
      .auth(studentToken, { type: 'bearer' })
      .send({
        name: 'Competición E2E',
        eventDate: todayDate(),
        category: 'Open',
        goal: 'Objetivo atleta',
      })
      .expect(201);
    competitionId = created.body.data.id;
    for (const token of [otherCoachToken, otherStudentToken]) {
      await api()
        .get(`/api/v1/competitions/${competitionId}`)
        .auth(token, { type: 'bearer' })
        .expect(404);
    }
    await api()
      .patch(`/api/v1/competitions/${competitionId}`)
      .auth(otherStudentToken, { type: 'bearer' })
      .send({ name: 'Ajena' })
      .expect(404);
    await api()
      .patch(`/api/v1/competitions/${competitionId}/coach-goal`)
      .auth(otherCoachToken, { type: 'bearer' })
      .send({ coachGoal: 'Ajeno' })
      .expect(404);
    await api()
      .patch(`/api/v1/competitions/${competitionId}`)
      .auth(studentToken, { type: 'bearer' })
      .send({ coachGoal: 'No permitido' })
      .expect(400);
    await api()
      .patch(`/api/v1/competitions/${competitionId}/coach-goal`)
      .auth(coachToken, { type: 'bearer' })
      .send({ coachGoal: 'Mantener técnica' })
      .expect(200);
    await api()
      .patch(`/api/v1/competitions/${competitionId}`)
      .auth(studentToken, { type: 'bearer' })
      .send({ location: 'Santiago' })
      .expect(200);
    const overview = await api()
      .get(`/api/v1/students/${studentId}/calendar`)
      .auth(coachToken, { type: 'bearer' })
      .expect(200);
    expect(overview.body.data.nextCompetition.id).toBe(competitionId);
    await api()
      .patch(`/api/v1/competitions/${competitionId}`)
      .auth(studentToken, { type: 'bearer' })
      .send({ status: 'CANCELLED' })
      .expect(200);
    const cancelled = await api()
      .get('/api/v1/calendar/me')
      .auth(studentToken, { type: 'bearer' })
      .expect(200);
    expect(cancelled.body.data.nextCompetition).toBeNull();
  });
  it('chat con imagen, descarga privada, texto y notificaciones propias', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    );
    const result = await api()
      .post(`/api/v1/messages/${studentId}`)
      .auth(coachToken, { type: 'bearer' })
      .field('body', 'Revisa la técnica')
      .attach('file', png, {
        filename: 'tecnica.png',
        contentType: 'image/png',
      })
      .expect(201);
    attachmentId = result.body.data.attachments[0].id;
    expect(result.body.data.attachments[0].storageKey).toBeUndefined();
    await api()
      .get(`/api/v1/messages/attachments/${attachmentId}`)
      .auth(studentToken, { type: 'bearer' })
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    for (const token of [otherCoachToken, otherStudentToken])
      await api()
        .get(`/api/v1/messages/attachments/${attachmentId}`)
        .auth(token, { type: 'bearer' })
        .expect(404);
    await api()
      .get(`/api/v1/messages/${studentId}`)
      .auth(otherCoachToken, { type: 'bearer' })
      .expect(404);
    await api()
      .post(`/api/v1/messages/${studentId}`)
      .auth(otherStudentToken, { type: 'bearer' })
      .send({ body: 'No permitido' })
      .expect(404);
    await api()
      .post(`/api/v1/messages/${coachId}`)
      .auth(studentToken, { type: 'bearer' })
      .send({ body: 'Gracias' })
      .expect(201);
    await api()
      .post(`/api/v1/messages/${studentId}`)
      .auth(coachToken, { type: 'bearer' })
      .attach('file', Buffer.from('<script>bad</script>'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
    const notices = await api()
      .get('/api/v1/notifications')
      .auth(studentToken, { type: 'bearer' })
      .expect(200);
    expect(
      notices.body.data.every(
        (n: { userId: string }) => n.userId === studentId,
      ),
    ).toBe(true);
    const id = notices.body.data[0].id;
    await api()
      .patch(`/api/v1/notifications/${id}/read`)
      .auth(otherStudentToken, { type: 'bearer' })
      .send({})
      .expect(404);
    await api()
      .patch(`/api/v1/notifications/${id}/read`)
      .auth(studentToken, { type: 'bearer' })
      .send({})
      .expect(200);
    await api()
      .patch('/api/v1/notifications/read-all')
      .auth(studentToken, { type: 'bearer' })
      .send({})
      .expect(200);
    const count = await api()
      .get('/api/v1/notifications/unread-count')
      .auth(studentToken, { type: 'bearer' })
      .expect(200);
    expect(count.body.data.count).toBe(0);
    await api()
      .get(`/api/v1/notifications?userId=${coachId}`)
      .auth(studentToken, { type: 'bearer' })
      .expect(400);
  });
  it('edita solo perfil propio y no filtra secretos', async () => {
    await api()
      .patch('/api/v1/profile/me')
      .auth(studentToken, { type: 'bearer' })
      .send({ city: 'Santiago', sport: 'Fuerza' })
      .expect(200);
    const profile = await api()
      .get('/api/v1/profile/me')
      .auth(studentToken, { type: 'bearer' })
      .expect(200);
    expect(profile.body.data.profile.city).toBe('Santiago');
    expect(profile.body.data.coach.id).toBe(coachId);
    expect(profile.body.data.passwordHash).toBeUndefined();
    await api()
      .patch('/api/v1/profile/me')
      .auth(studentToken, { type: 'bearer' })
      .send({ userId: coachId })
      .expect(400);
  });
  it('video real en ambos sentidos: acceso privado y notificación al receptor', async () => {
    for (const [senderToken, receiverToken, peerId] of [
      [coachToken, studentToken, studentId],
      [studentToken, coachToken, coachId],
    ]) {
      const sent = await api()
        .post(`/api/v1/messages/${peerId}`)
        .auth(senderToken, { type: 'bearer' })
        .attach('file', join(__dirname, 'fixtures/chat-video.webm'))
        .expect(201);
      const attachment = sent.body.data.attachments[0];
      expect(attachment.type).toBe('VIDEO');
      await api()
        .get(`/api/v1/messages/attachments/${attachment.id}`)
        .auth(receiverToken, { type: 'bearer' })
        .expect(200)
        .expect('Content-Type', 'video/webm');
      await api()
        .get(`/api/v1/messages/attachments/${attachment.id}`)
        .expect(401);
      await api()
        .get(`/api/v1/messages/attachments/${attachment.id}`)
        .auth(otherStudentToken, { type: 'bearer' })
        .expect(404);
      const notices = await api()
        .get('/api/v1/notifications')
        .auth(receiverToken, { type: 'bearer' })
        .expect(200);
      expect(notices.body.data[0].type).toBe('NEW_MESSAGE_ATTACHMENT');
    }
  });
  it('Coach y Alumno conservan sesión con refresh + CSRF y logout la revoca', async () => {
    for (const userId of [coachId, studentId]) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      const browser = request.agent(app.getHttpServer());
      const login = await browser
        .post('/api/v1/auth/login')
        .send({ email: user.email, password })
        .expect(200);
      const cookies = login.headers['set-cookie'] as unknown as string[];
      expect(cookies.find((c) => c.startsWith('refresh_token='))).toMatch(
        /HttpOnly/,
      );
      expect(cookies.find((c) => c.startsWith('refresh_token='))).toMatch(
        /Path=\/api\/v1\/auth/,
      );
      const csrfCookie = cookies.find(
        (c) => c.startsWith('csrf_token=') && !c.startsWith('csrf_token=;'),
      )!;
      expect(csrfCookie).toMatch(/Path=\//);
      expect(csrfCookie).not.toMatch(/HttpOnly/);
      const csrf = csrfCookie.split(';')[0].slice('csrf_token='.length);
      await browser.post('/api/v1/auth/refresh').expect(403);
      await browser
        .post('/api/v1/auth/refresh')
        .set('X-CSRF-Token', 'wrong')
        .expect(403);
      const renewed = await browser
        .post('/api/v1/auth/refresh')
        .set('X-CSRF-Token', csrf)
        .expect(200);
      expect(renewed.body.data.user.id).toBe(userId);
      expect(renewed.body.data.accessToken).toEqual(expect.any(String));
      const nextCookies = renewed.headers['set-cookie'] as unknown as string[];
      expect(
        nextCookies.find((c) => c.startsWith('refresh_token=')),
      ).not.toEqual(cookies.find((c) => c.startsWith('refresh_token=')));
      const nextCsrf = nextCookies
        .find(
          (c) => c.startsWith('csrf_token=') && !c.startsWith('csrf_token=;'),
        )!
        .split(';')[0]
        .slice('csrf_token='.length);
      await browser
        .get('/api/v1/profile/me')
        .auth(renewed.body.data.accessToken, { type: 'bearer' })
        .expect(200);
      await browser
        .post('/api/v1/auth/logout')
        .auth(renewed.body.data.accessToken, { type: 'bearer' })
        .set('X-CSRF-Token', nextCsrf)
        .expect(200);
      await browser
        .post('/api/v1/auth/refresh')
        .set('X-CSRF-Token', nextCsrf)
        .expect(403);
      const oldCookies = nextCookies
        .filter((c) => !c.startsWith('csrf_token=;'))
        .map((c) => c.split(';')[0]);
      await api()
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldCookies)
        .set('X-CSRF-Token', nextCsrf)
        .expect(401);
    }
  });
});
