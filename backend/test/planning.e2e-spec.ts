import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { hash, argon2id } from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/tokens/token.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { MailService } from '../src/mail/mail.service';
import { todayDate, dateOnly } from '../src/common/training/calendar-date';

const suite = process.env.COACHING_E2E_DATABASE_URL ? describe : describe.skip;
suite('P1 planning with PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  let coach: string, student: string, other: string, peer: string;
  let coachId: string, studentId: string, peerId: string;
  let programId: string,
    weekId: string,
    sessionId: string,
    assignmentId: string;
  const users: string[] = [];
  const today = todayDate();
  const tomorrow = new Date(dateOnly(today).getTime() + 86400000)
    .toISOString()
    .slice(0, 10);
  const suffix = randomUUID();
  const http = () => request(app.getHttpServer());
  const schedule = () =>
    `/api/v1/program-assignments/${assignmentId}/sessions/${sessionId}/schedule`;
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.COACHING_E2E_DATABASE_URL;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({})
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
    db = app.get(PrismaService);
    async function user(role: 'COACH' | 'STUDENT', owner?: string) {
      const u = await db.user.create({
        data: {
          email: `${users.length}-${suffix}@example.invalid`,
          name: 'P1 fixture',
          role,
          coachId: owner,
          passwordHash: 'no-login-test-fixture',
        },
      });
      users.push(u.id);
      return { id: u.id, token: app.get(TokenService).signAccessToken(u) };
    }
    const c = await user('COACH');
    coachId = c.id;
    coach = c.token;
    other = (await user('COACH')).token;
    const s = await user('STUDENT', coachId);
    studentId = s.id;
    student = s.token;
    const p = await user('STUDENT', coachId);
    peerId = p.id;
    peer = p.token;
    const exercise = await db.exercise.create({
      data: { coachId, name: 'Sentadilla P1' },
    });
    const program = await db.program.create({
      data: {
        coachId,
        name: 'Plan P1',
        blocks: {
          create: {
            name: 'Base',
            order: 1,
            weeks: {
              create: {
                number: 1,
                order: 1,
                sessions: {
                  create: [
                    {
                      name: 'Día P1',
                      order: 1,
                      dayOfWeek: dateOnly(today).getUTCDay() || 7,
                      sessionExercises: {
                        create: {
                          exerciseId: exercise.id,
                          order: 1,
                          targetSets: 2,
                          targetRepsMin: 5,
                          targetRepsMax: 8,
                          targetRpe: 8.5,
                          targetRir: 2,
                          restSeconds: 90,
                          notes: 'Tempo',
                        },
                      },
                    },
                    { name: 'Segundo', order: 2, dayOfWeek: null },
                  ],
                },
              },
            },
          },
        },
      },
      include: {
        blocks: {
          include: {
            weeks: { include: { sessions: { orderBy: { order: 'asc' } } } },
          },
        },
      },
    });
    programId = program.id;
    weekId = program.blocks[0].weeks[0].id;
    sessionId = program.blocks[0].weeks[0].sessions[0].id;
    assignmentId = (
      await db.programAssignment.create({
        data: { programId, studentId, startDate: dateOnly(today) },
      })
    ).id;
    await db.programAssignment.create({
      data: { programId, studentId: peerId, startDate: dateOnly(today) },
    });
  });
  afterAll(async () => {
    if (db) {
      await db.message.deleteMany({
        where: {
          OR: [{ senderId: { in: users } }, { receiverId: { in: users } }],
        },
      });
      await db.workoutLog.deleteMany({ where: { studentId: { in: users } } });
      await db.program.deleteMany({ where: { coachId: { in: users } } });
      await db.exercise.deleteMany({ where: { coachId: { in: users } } });
      await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
      await db.user.deleteMany({
        where: { id: { in: users }, role: 'STUDENT' },
      });
      await db.user.deleteMany({ where: { id: { in: users }, role: 'COACH' } });
    }
    await app?.close();
  });
  it('deep copies program, avoids name collisions and excludes execution/assignments', async () => {
    for (const name of ['Plan P1 (copia)', 'Plan P1 (copia 2)']) {
      const r = await http()
        .post(`/api/v1/programs/${programId}/duplicate`)
        .auth(coach, { type: 'bearer' })
        .expect(201);
      const p = await db.program.findUniqueOrThrow({
        where: { id: r.body.data.id },
        include: {
          assignments: true,
          blocks: {
            include: {
              weeks: {
                include: {
                  sessions: {
                    orderBy: { order: 'asc' },
                    include: { sessionExercises: true, workoutLogs: true },
                  },
                },
              },
            },
          },
        },
      });
      expect(p.name).toBe(name);
      expect(p.assignments).toEqual([]);
      const s = p.blocks[0].weeks[0].sessions[0];
      expect(s.id).not.toBe(sessionId);
      expect(s.workoutLogs).toEqual([]);
      expect(s.sessionExercises[0]).toMatchObject({
        targetSets: 2,
        targetRepsMin: 5,
        targetRepsMax: 8,
        targetRir: 2,
        restSeconds: 90,
        notes: 'Tempo',
      });
      expect(s.sessionExercises[0].targetRpe?.toString()).toBe('8.5');
    }
  });
  it('enforces ownership and coach RBAC on every copy and schedule', async () => {
    for (const [kind, id] of [
      ['programs', programId],
      ['weeks', weekId],
      ['sessions', sessionId],
    ]) {
      await http()
        .post(`/api/v1/${kind}/${id}/duplicate`)
        .auth(other, { type: 'bearer' })
        .expect(404);
      await http()
        .post(`/api/v1/${kind}/${id}/duplicate`)
        .auth(student, { type: 'bearer' })
        .expect(403);
    }
    await http()
      .patch(schedule())
      .auth(other, { type: 'bearer' })
      .send({ scheduledDate: tomorrow })
      .expect(404);
    await http()
      .patch(schedule())
      .auth(student, { type: 'bearer' })
      .send({ scheduledDate: tomorrow })
      .expect(403);
    await http()
      .get(`/api/v1/students/${studentId}/calendar`)
      .auth(other, { type: 'bearer' })
      .expect(404);
    await http()
      .get(`/api/v1/students/${studentId}/calendar`)
      .auth(peer, { type: 'bearer' })
      .expect(403);
  });
  it('reschedules only one athlete, preserves original date and notifies; reset restores adherence denominator', async () => {
    await http()
      .patch(schedule())
      .auth(coach, { type: 'bearer' })
      .send({ scheduledDate: tomorrow })
      .expect(200);
    const own = await http()
      .get('/api/v1/calendar/me')
      .auth(student, { type: 'bearer' })
      .expect(200);
    expect(own.body.data.nextSession.date).toBe(tomorrow);
    expect(own.body.data.assignments[0].adherence.adherenceRate).toBeNull();
    const otherCalendar = await http()
      .get('/api/v1/calendar/me')
      .auth(peer, { type: 'bearer' })
      .expect(200);
    expect(otherCalendar.body.data.nextSession.date).toBe(today);
    await http()
      .patch(schedule())
      .auth(coach, { type: 'bearer' })
      .send({ scheduledDate: today })
      .expect(200);
    const override = await db.sessionScheduleOverride.findFirstOrThrow({
      where: { programAssignmentId: assignmentId },
    });
    expect(override.originalDate).toEqual(dateOnly(today));
    expect(
      await db.notification.count({
        where: { userId: studentId, type: 'SESSION_RESCHEDULED' },
      }),
    ).toBe(2);
    await http()
      .patch(`/api/v1/program-assignments/${assignmentId}/start-date`)
      .auth(coach, { type: 'bearer' })
      .send({ startDate: tomorrow })
      .expect(409);
    await http()
      .post(`${schedule()}/reset`)
      .auth(coach, { type: 'bearer' })
      .expect(201);
    expect(
      await db.sessionScheduleOverride.count({
        where: { programAssignmentId: assignmentId },
      }),
    ).toBe(0);
  });
  it('blocks started and finished workouts, counts completion once, and protects startDate', async () => {
    const started = await http()
      .post(`/api/v1/sessions/${sessionId}/workout-logs`)
      .auth(student, { type: 'bearer' })
      .expect(201);
    await http()
      .patch(schedule())
      .auth(coach, { type: 'bearer' })
      .send({ scheduledDate: tomorrow })
      .expect(409);
    await http()
      .post(`${schedule()}/reset`)
      .auth(coach, { type: 'bearer' })
      .expect(409);
    let calendar = await http()
      .get('/api/v1/calendar/me')
      .auth(student, { type: 'bearer' })
      .expect(200);
    expect(calendar.body.data.assignments[0].adherence).toEqual({
      scheduledSessions: 1,
      completedSessions: 0,
      adherenceRate: 0,
    });
    await db.workoutLog.update({
      where: { id: started.body.data.id },
      data: { durationMinutes: 30 },
    });
    await db.workoutLog.create({
      data: {
        studentId,
        sessionId,
        completionStatus: 'COMPLETED',
        durationMinutes: 20,
      },
    });
    calendar = await http()
      .get('/api/v1/calendar/me')
      .auth(student, { type: 'bearer' })
      .expect(200);
    expect(calendar.body.data.assignments[0].adherence).toEqual({
      scheduledSessions: 1,
      completedSessions: 1,
      adherenceRate: 100,
    });
    await http()
      .patch(schedule())
      .auth(coach, { type: 'bearer' })
      .send({ scheduledDate: tomorrow })
      .expect(409);
    await http()
      .patch(`/api/v1/program-assignments/${assignmentId}/start-date`)
      .auth(coach, { type: 'bearer' })
      .send({ startDate: tomorrow })
      .expect(409);
  });
  it('duplicates week/session immediately after source and preserves same-day sessions', async () => {
    const copy = await http()
      .post(`/api/v1/sessions/${sessionId}/duplicate`)
      .auth(coach, { type: 'bearer' })
      .expect(201);
    const sessions = await db.session.findMany({
      where: { weekId },
      orderBy: { order: 'asc' },
      include: { sessionExercises: true, workoutLogs: true },
    });
    expect(sessions.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(sessions[1].id).toBe(copy.body.data.id);
    expect(sessions[1].dayOfWeek).toBe(sessions[0].dayOfWeek);
    expect(sessions[1].sessionExercises).toHaveLength(1);
    expect(sessions[1].workoutLogs).toHaveLength(0);
    await http()
      .post(`/api/v1/weeks/${weekId}/duplicate`)
      .auth(coach, { type: 'bearer' })
      .expect(201);
    const weeks = await db.week.findMany({
      where: {
        blockId: (await db.week.findUniqueOrThrow({ where: { id: weekId } }))
          .blockId,
      },
      orderBy: { order: 'asc' },
      include: { sessions: true },
    });
    expect(weeks.map((w) => w.order)).toEqual([1, 2]);
    expect(weeks[1].sessions).toHaveLength(3);
    const calendar = await http()
      .get('/api/v1/calendar/me')
      .auth(peer, { type: 'bearer' })
      .expect(200);
    expect(
      calendar.body.data.sessions.filter(
        (s: { date: string }) => s.date === today,
      ),
    ).toHaveLength(2);
  });
  it('separates new assignment cycles, preserving ambiguous legacy history without backfill', async () => {
    await db.programAssignment.update({
      where: { id: assignmentId },
      data: { status: 'FINISHED' },
    });
    const legacy = await db.workoutLog.findFirstOrThrow({
      where: { studentId, sessionId, programAssignmentId: null },
    });
    assignmentId = (
      await db.programAssignment.create({
        data: { programId, studentId, startDate: dateOnly(today) },
      })
    ).id;
    let response = await http()
      .get('/api/v1/calendar/me')
      .auth(student, { type: 'bearer' })
      .expect(200);
    expect(
      response.body.data.assignments[0].adherence.adherenceRate,
    ).toBeNull();
    expect(response.body.data.assignments[0].adherence.insufficientReason).toBe(
      'legacy-history',
    );
    // Remove only the deliberately ambiguous test record; scoped prior-cycle history remains.
    await db.workoutLog.delete({ where: { id: legacy.id } });
    response = await http()
      .get('/api/v1/calendar/me')
      .auth(student, { type: 'bearer' })
      .expect(200);
    expect(response.body.data.assignments[0].adherence.completedSessions).toBe(
      0,
    );
    expect(response.body.data.assignments[0].adherence.adherenceRate).toBe(0);
    await http()
      .patch(schedule())
      .auth(coach, { type: 'bearer' })
      .send({ scheduledDate: tomorrow })
      .expect(200);
    const started = await http()
      .post(`/api/v1/sessions/${sessionId}/workout-logs`)
      .auth(student, { type: 'bearer' })
      .expect(201);
    const log = await db.workoutLog.findUniqueOrThrow({
      where: { id: started.body.data.id },
    });
    expect(log.programAssignmentId).toBe(assignmentId);
    const currentLogs = await http()
      .get(`/api/v1/sessions/${sessionId}/workout-logs`)
      .auth(student, { type: 'bearer' })
      .expect(200);
    expect(currentLogs.body.data.map((w: { id: string }) => w.id)).toEqual([
      log.id,
    ]);
    await db.sessionScheduleOverride.deleteMany({
      where: { programAssignmentId: assignmentId },
    });
    await db.workoutLog.update({
      where: { id: log.id },
      data: { durationMinutes: 20 },
    });
    response = await http()
      .get('/api/v1/calendar/me')
      .auth(student, { type: 'bearer' })
      .expect(200);
    expect(response.body.data.assignments[0].adherence.completedSessions).toBe(
      1,
    );
    expect(response.body.data.assignments[0].adherence.adherenceRate).toBe(50);
    const history = await http()
      .get('/api/v1/workout-logs')
      .auth(student, { type: 'bearer' })
      .expect(200);
    expect(history.body.meta.total).toBe(2);
    await http()
      .patch(schedule())
      .auth(coach, { type: 'bearer' })
      .send({ scheduledDate: today })
      .expect(409);
  });
  it('health readiness and request ID work over HTTP', async () => {
    const result = await http().get('/api/v1/health/ready').expect(200);
    expect(result.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    await http().get('/api/v1/health/live').expect(200);
  });
  it('inactive student cannot create activity; owner retains history and sessions stay revoked after reactivation', async () => {
    const password = 'Lifecycle-fixture-2026!';
    const account = await db.user.update({
      where: { id: studentId },
      data: { passwordHash: await hash(password, { type: argon2id }) },
    });
    await http()
      .post('/api/v1/auth/login')
      .send({ email: account.email, password })
      .expect(200);
    await http()
      .post(`/api/v1/messages/${studentId}`)
      .auth(coach, { type: 'bearer' })
      .send({ body: 'Histórico conservado' })
      .expect(201);
    const competition = await db.competition.create({
      data: {
        studentId,
        name: 'Evento histórico',
        eventDate: dateOnly(today),
        category: 'Local',
      },
    });
    const noticeCount = await db.notification.count({
      where: { userId: studentId },
    });
    await http()
      .patch(`/api/v1/students/${studentId}/status`)
      .auth(coach, { type: 'bearer' })
      .send({ isActive: false })
      .expect(200);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: account.email, password })
      .expect(401);
    await http()
      .post(`/api/v1/sessions/${sessionId}/workout-logs`)
      .auth(student, { type: 'bearer' })
      .expect(401);
    await http()
      .post('/api/v1/competitions')
      .auth(student, { type: 'bearer' })
      .send({})
      .expect(401);
    await http()
      .post(`/api/v1/messages/${coachId}`)
      .auth(student, { type: 'bearer' })
      .send({ body: 'No' })
      .expect(401);
    await http()
      .patch('/api/v1/profile/me')
      .auth(student, { type: 'bearer' })
      .send({ city: 'No' })
      .expect(401);
    await http()
      .post(`/api/v1/messages/${studentId}`)
      .auth(coach, { type: 'bearer' })
      .send({ body: 'No' })
      .expect(404);
    const messages = await http()
      .get(`/api/v1/messages/${studentId}`)
      .auth(coach, { type: 'bearer' })
      .expect(200);
    expect(messages.body.data[0].body).toBe('Histórico conservado');
    await http()
      .get(`/api/v1/competitions/${competition.id}`)
      .auth(coach, { type: 'bearer' })
      .expect(200);
    await http()
      .get(`/api/v1/dashboard/students/${studentId}`)
      .auth(coach, { type: 'bearer' })
      .expect(200);
    await http()
      .get(`/api/v1/program-assignments/${assignmentId}`)
      .auth(coach, { type: 'bearer' })
      .expect(200);
    await http()
      .post(`/api/v1/programs/${programId}/assign`)
      .auth(coach, { type: 'bearer' })
      .send({ studentId })
      .expect(422);
    await http()
      .patch(`/api/v1/program-assignments/${assignmentId}/status`)
      .auth(coach, { type: 'bearer' })
      .send({ status: 'FINISHED' })
      .expect(200);
    await http()
      .patch(`/api/v1/program-assignments/${assignmentId}/status`)
      .auth(coach, { type: 'bearer' })
      .send({ status: 'ACTIVE' })
      .expect(422);
    await app
      .get(NotificationsService)
      .create(db, studentId, 'NEW_MESSAGE', 'No generar', 'message', 'fixture');
    expect(await db.notification.count({ where: { userId: studentId } })).toBe(
      noticeCount,
    );
    expect(await db.workoutLog.count({ where: { studentId } })).toBe(2);
    expect(
      await db.refreshSession.count({
        where: { userId: studentId, revokedAt: null },
      }),
    ).toBe(0);
    await http()
      .patch(`/api/v1/students/${studentId}/status`)
      .auth(coach, { type: 'bearer' })
      .send({ isActive: true })
      .expect(200);
    await http()
      .get('/api/v1/profile/me')
      .auth(student, { type: 'bearer' })
      .expect(401);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: account.email, password })
      .expect(200);
  });
});
