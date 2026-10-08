import { PrismaClient, Role } from '@prisma/client';
import { hash, argon2id } from 'argon2';
import { createHash } from 'crypto';
import { dateOnly, todayDate } from '../src/common/training/calendar-date';

// Explicit opt-in, never called by application startup. No real credentials.
const prisma = new PrismaClient();
const id = (key: string) => 'c' + createHash('sha256').update('coaching-demo:' + key).digest('hex').slice(0, 24);
async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_SEED_CONFIRM !== '1')
    throw new Error('Demo deshabilitada. Usa un entorno local y DEMO_SEED_CONFIRM=1.');
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    throw new Error('Define DEMO_PASSWORD (10+ caracteres, letras y números).');
  const passwordHash = await hash(password, { type: argon2id });
  const today = dateOnly(todayDate());
  const coach = await prisma.user.upsert({ where: { email: 'coach.demo@example.com' }, update: {}, create: {
    email: 'coach.demo@example.com', name: 'Coach Demo', role: Role.COACH, passwordHash,
  } });
  // Repair the unusable placeholder from the original seed only. Never reset real hashes.
  await prisma.user.updateMany({ where: { id: coach.id, passwordHash: 'DEV_SEED_NO_REAL_HASH' }, data: { passwordHash } });
  const exercise = await prisma.exercise.upsert({ where: { id: id('exercise') }, update: {}, create: { id: id('exercise'), coachId: coach.id, name: 'Sentadilla (demo)', muscleGroup: 'Piernas' } });
  const program = await prisma.program.upsert({ where: { id: id('program') }, update: {}, create: {
    id: id('program'), coachId: coach.id, name: 'Fuerza inicial (demo)', durationWeeks: 8,
    blocks: { create: [0, 1].map((block) => ({ name: `Bloque ${block + 1} (demo)`, order: block + 1,
      weeks: { create: [0, 1, 2, 3].map((week) => ({ number: block * 4 + week + 1, order: week + 1,
        sessions: { create: [1, 3, 5].map((day, index) => ({ name: `Sesión ${index + 1} (demo)`, dayOfWeek: day, order: index + 1,
          sessionExercises: { create: { exerciseId: exercise.id, order: 1, targetSets: 3, targetRepsMin: 5, targetRepsMax: 8, targetRpe: 7 } },
        })) },
      })) },
    })) },
  } });
  const sessions = await prisma.session.findMany({ where: { week: { block: { programId: program.id } } }, orderBy: { order: 'asc' }, include: { sessionExercises: true }, take: 3 });
  for (let i = 0; i < 3; i++) {
    const email = i === 0 ? 'alumno.demo@example.com' : `alumno${i + 1}.demo@example.com`;
    const student = await prisma.user.upsert({ where: { email }, update: {}, create: { email, passwordHash, role: Role.STUDENT, coachId: coach.id, name: `Atleta ${i + 1} Demo` } });
    if (student.coachId !== coach.id) throw new Error('Cuenta demo existente con relación distinta. No se modifica.');
    await prisma.user.updateMany({ where: { id: student.id, passwordHash: 'DEV_SEED_NO_REAL_HASH' }, data: { passwordHash } });
    await prisma.programAssignment.upsert({ where: { id: id(`assignment-${i}`) }, update: {}, create: { id: id(`assignment-${i}`), programId: program.id, studentId: student.id, startDate: today } });
    const eventDate = new Date(today); eventDate.setUTCDate(eventDate.getUTCDate() + 14 + i * 7);
    await prisma.competition.upsert({ where: { id: id(`competition-${i}`) }, update: {}, create: { id: id(`competition-${i}`), studentId: student.id, name: 'Encuentro de fuerza (demo)', category: 'Open', eventDate, goal: 'Completar la preparación', coachGoal: 'Priorizar la técnica' } });
    await prisma.message.upsert({ where: { id: id(`message-${i}`) }, update: {}, create: { id: id(`message-${i}`), senderId: coach.id, receiverId: student.id, body: 'Mensaje de demostración: revisa tu programa y comparte tus dudas.' } });
    await prisma.notification.upsert({ where: { dedupeKey: `demo:${student.id}` }, update: {}, create: { userId: student.id, type: 'PROGRAM_ASSIGNED', title: 'Programa demo disponible', body: 'Datos de demostración', resourceType: 'program', resourceId: program.id, dedupeKey: `demo:${student.id}` } });
    for (let j = 0; j < sessions.length; j++) {
      const performedAt = new Date(today); performedAt.setUTCDate(performedAt.getUTCDate() - 2 - j * 3); performedAt.setUTCHours(15);
      await prisma.workoutLog.upsert({ where: { id: id(`workout-${i}-${j}`) }, update: {}, create: {
        id: id(`workout-${i}-${j}`), studentId: student.id, sessionId: sessions[j].id, performedAt, completionStatus: 'COMPLETED', durationMinutes: 45, overallRpe: 7,
        setLogs: { create: { sessionExerciseId: sessions[j].sessionExercises[0].id, setNumber: 1, actualLoad: 40 + i * 10, actualReps: 8, actualRpe: 7, actualRir: 3 } },
      } });
    }
  }
  console.log('Demo preparada: 1 coach, 3 alumnos, 8 semanas, competiciones, historial, mensajes y notificaciones. No se muestran contraseñas.');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Error de seed'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
