import { capturePrescription } from '../src/common/training/workout-prescription';
import { PrismaClient, Role } from '@prisma/client';
import { hash, argon2id } from 'argon2';
import { createHash } from 'crypto';
import { dateOnly, todayDate } from '../src/common/training/calendar-date';

// Explicit opt-in, never called by application startup. No real credentials.
const database = new PrismaClient();
const id = (key: string) =>
  'c' +
  createHash('sha256')
    .update('coaching-demo:' + key)
    .digest('hex')
    .slice(0, 24);
async function main() {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.DEMO_SEED_CONFIRM !== '1'
  )
    throw new Error(
      'Demo deshabilitada. Usa un entorno local y DEMO_SEED_CONFIRM=1.',
    );
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname))
    throw new Error('El seed demo admite solamente PostgreSQL local.');
  const syncPassword = process.env.DEMO_SYNC_PASSWORD === '1';
  const password = process.env.DEMO_PASSWORD;
  if (
    !password ||
    password.length < 10 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  )
    throw new Error('Define DEMO_PASSWORD (10+ caracteres, letras y números).');
  const passwordHash = await hash(password, { type: argon2id });
  const today = dateOnly(todayDate());
  const studentCount = Number(process.env.DEMO_STUDENT_COUNT ?? 3);
  if (![1, 2, 3].includes(studentCount))
    throw new Error('DEMO_STUDENT_COUNT debe ser 1, 2 o 3.');
  const startDate = new Date(today.getTime() - 14 * 86400000);
  const days = [0, 2, 4].map(
    (offset) => (((today.getUTCDay() || 7) - 1 + offset) % 7) + 1,
  );
  await database.$transaction(
    async (prisma) => {
      const coach = await prisma.user.upsert({
        where: { email: 'coach.demo@example.com' },
        update: {},
        create: {
          email: 'coach.demo@example.com',
          name: 'Coach Demo',
          role: Role.COACH,
          passwordHash,
        },
      });
      if (coach.role !== Role.COACH)
        throw new Error(
          'La cuenta demo existente no es Coach. No se modifica.',
        );
      // Existing hashes are preserved unless the local demo operator explicitly opts in.
      await prisma.user.updateMany({
        where: {
          id: coach.id,
          ...(syncPassword ? {} : { passwordHash: 'DEV_SEED_NO_REAL_HASH' }),
        },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      if (syncPassword)
        await prisma.refreshSession.updateMany({
          where: { userId: coach.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await prisma.userProfile.upsert({
        where: { userId: coach.id },
        update: {},
        create: {
          userId: coach.id,
          displayName: 'Coach Demo',
          city: 'Santiago',
          sport: 'Preparación física',
          bio: 'Perfil ficticio para presentación de la plataforma.',
        },
      });
      const exercise = await prisma.exercise.upsert({
        where: { id: id('exercise') },
        update: {},
        create: {
          id: id('exercise'),
          coachId: coach.id,
          name: 'Sentadilla (demo)',
          muscleGroup: 'Piernas',
        },
      });
      const exercises = [exercise];
      for (const [key, name, muscleGroup] of [
        ['row', 'Remo (demo)', 'Espalda'],
        ['press', 'Press banca (demo)', 'Pecho'],
      ]) {
        exercises.push(
          await prisma.exercise.upsert({
            where: { id: id(key) },
            update: {},
            create: { id: id(key), coachId: coach.id, name, muscleGroup },
          }),
        );
      }
      const program = await prisma.program.upsert({
        where: { id: id('program') },
        update: {},
        create: {
          id: id('program'),
          coachId: coach.id,
          name: 'Fuerza inicial (demo)',
          durationWeeks: 8,
          blocks: {
            create: [0, 1].map((block) => ({
              name: `Bloque ${block + 1} (demo)`,
              order: block + 1,
              weeks: {
                create: [0, 1, 2, 3].map((week) => ({
                  number: block * 4 + week + 1,
                  order: week + 1,
                  sessions: {
                    create: days.map((day, index) => ({
                      name: `Sesión ${index + 1} (demo)`,
                      dayOfWeek: day,
                      order: index + 1,
                      sessionExercises: {
                        create: exercises.map((e, order) => ({
                          exerciseId: e.id,
                          order: order + 1,
                          targetSets: 3,
                          targetRepsMin: 5,
                          targetRepsMax: 8,
                          targetRpe: 7,
                        })),
                      },
                    })),
                  },
                })),
              },
            })),
          },
        },
      });
      const sessions = await prisma.session.findMany({
        where: { week: { block: { programId: program.id } } },
        orderBy: [{ week: { number: 'asc' } }, { order: 'asc' }],
        include: { sessionExercises: { include: { exercise: true } } },
        take: 6,
      });
      for (let i = 0; i < studentCount; i++) {
        const email =
          i === 0
            ? 'alumno.demo@example.com'
            : `alumno${i + 1}.demo@example.com`;
        const student = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            passwordHash,
            role: Role.STUDENT,
            coachId: coach.id,
            name: `Atleta ${i + 1} Demo`,
          },
        });
        if (student.role !== Role.STUDENT || student.coachId !== coach.id)
          throw new Error(
            'Cuenta demo existente con relación distinta. No se modifica.',
          );
        await prisma.user.updateMany({
          where: {
            id: student.id,
            ...(syncPassword ? {} : { passwordHash: 'DEV_SEED_NO_REAL_HASH' }),
          },
          data: { passwordHash, tokenVersion: { increment: 1 } },
        });
        if (syncPassword)
          await prisma.refreshSession.updateMany({
            where: { userId: student.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        await prisma.userProfile.upsert({
          where: { userId: student.id },
          update: {},
          create: {
            userId: student.id,
            displayName: 'Atleta Demo',
            city: 'Santiago',
            sport: 'Fuerza',
            bio: 'Alumno ficticio con historial para demostración.',
          },
        });
        await prisma.programAssignment.upsert({
          where: { id: id(`assignment-${i}`) },
          update: {},
          create: {
            id: id(`assignment-${i}`),
            programId: program.id,
            studentId: student.id,
            startDate,
          },
        });
        const eventDate = new Date(today);
        eventDate.setUTCDate(eventDate.getUTCDate() + 14 + i * 7);
        await prisma.competition.upsert({
          where: { id: id(`competition-${i}`) },
          update: {},
          create: {
            id: id(`competition-${i}`),
            studentId: student.id,
            name: 'Encuentro de fuerza (demo)',
            category: 'Open',
            eventDate,
            goal: 'Completar la preparación',
            coachGoal: 'Priorizar la técnica',
          },
        });
        await prisma.competition.upsert({
          where: { id: id(`control-${i}`) },
          update: {},
          create: {
            id: id(`control-${i}`),
            studentId: student.id,
            name: 'Control técnico de hoy (demo)',
            category: 'Evaluación',
            eventDate: today,
            location: 'Gimnasio de demostración',
            goal: 'Registrar la ejecución',
            coachGoal: 'Controlar el movimiento y mantener RPE 7',
          },
        });
        await prisma.competition.upsert({
          where: { id: id(`past-${i}`) },
          update: {},
          create: {
            id: id(`past-${i}`),
            studentId: student.id,
            name: 'Encuentro previo (demo)',
            category: 'Open',
            eventDate: new Date(today.getTime() - 21 * 86400000),
            status: 'COMPLETED',
            notes:
              'Competición ficticia completada para demostrar el historial.',
          },
        });
        await prisma.message.upsert({
          where: { id: id(`message-${i}`) },
          update: {},
          create: {
            id: id(`message-${i}`),
            senderId: coach.id,
            receiverId: student.id,
            body: 'Mensaje de demostración: revisa tu programa y comparte tus dudas.',
          },
        });
        await prisma.notification.upsert({
          where: { dedupeKey: `demo:${student.id}` },
          update: {},
          create: {
            userId: student.id,
            type: 'PROGRAM_ASSIGNED',
            title: 'Programa demo disponible',
            body: 'Datos de demostración',
            resourceType: 'program',
            resourceId: program.id,
            dedupeKey: `demo:${student.id}`,
          },
        });
        await prisma.message.upsert({
          where: { id: id(`reply-${i}`) },
          update: {},
          create: {
            id: id(`reply-${i}`),
            senderId: student.id,
            receiverId: coach.id,
            body: 'Ya revisé mi planificación. Compartiré mi técnica por el chat.',
          },
        });
        await prisma.notification.upsert({
          where: { dedupeKey: `demo:coach:${student.id}` },
          update: {},
          create: {
            userId: coach.id,
            type: 'COMPETITION_CREATED',
            title: 'Tu alumno registró una competición demo',
            body: 'Control técnico programado para hoy',
            resourceType: 'student',
            resourceId: student.id,
            dedupeKey: `demo:coach:${student.id}`,
          },
        });
        for (let j = 0; j < sessions.length; j++) {
          const performedAt = new Date(startDate);
          performedAt.setUTCDate(
            performedAt.getUTCDate() + Math.floor(j / 3) * 7 + (j % 3) * 2,
          );
          performedAt.setUTCHours(15);
          await prisma.workoutLog.upsert({
            where: { id: id(`workout-${i}-${j}`) },
            update: {},
            create: {
              id: id(`workout-${i}-${j}`),
              studentId: student.id,
              sessionId: sessions[j].id,
              programAssignmentId: id(`assignment-${i}`),
              performedAt,
              completionStatus: j === 2 ? 'PARTIAL' : 'COMPLETED',
              durationMinutes: 40 + j * 2,
              overallRpe: 6 + (j % 3),
              fatigue: 3 + (j % 2),
              comments: 'Registro ficticio de demostración',
              prescriptionCapturedAt: new Date(),
              prescriptions: {
                create: sessions[j].sessionExercises.map(capturePrescription),
              },
              setLogs: {
                create: sessions[j].sessionExercises.flatMap((e) =>
                  [1, 2, 3].map((setNumber) => ({
                    sessionExerciseId: e.id,
                    setNumber,
                    actualLoad: 40 + i * 10 + j * 2.5,
                    actualReps: 8,
                    actualRpe: 6 + (j % 3),
                    actualRir: 3 - (j % 2),
                  })),
                ),
              },
            },
          });
        }
      }
    },
    { timeout: 30000 },
  );
  console.log(
    `Demo preparada: 1 coach, ${studentCount} alumno(s), 8 semanas, competiciones, historial, mensajes y notificaciones. No se muestran contraseñas.`,
  );
}
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Error de seed');
    process.exitCode = 1;
  })
  .finally(() => database.$disconnect());
