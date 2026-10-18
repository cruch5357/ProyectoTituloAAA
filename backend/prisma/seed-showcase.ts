import { PrismaClient, Role } from '@prisma/client';
import { hash, argon2id } from 'argon2';
import { createHash } from 'crypto';
import { readFile, mkdir, writeFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import { capturePrescription } from '../src/common/training/workout-prescription';
import {
  dateOnly,
  todayDate,
  sessionDate,
} from '../src/common/training/calendar-date';
import { MUSCLE_GROUPS } from '../src/exercises/exercise-taxonomy';
import { validateExcelRow } from '../src/common/imports/excel-row-validation';

// Separate identities: never overwrite the original demo or real accounts.
const db = new PrismaClient();
const id = (key: string) =>
  'c' +
  createHash('sha256').update(`showcase-v1:${key}`).digest('hex').slice(0, 24);
const daysAgo = (date: Date, days: number) =>
  new Date(date.getTime() - days * 86400000);

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.DEMO_SEED_CONFIRM !== '1' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    throw new Error(
      'Solo demo local: requiere DEMO_SEED_CONFIRM=1 y PostgreSQL local.',
    );
  }
  const password = process.env.DEMO_PASSWORD;
  if (
    !password ||
    password.length < 10 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw new Error(
      'Define DEMO_PASSWORD con al menos 10 caracteres, letras y números.',
    );
  }
  const passwordHash = await hash(password, { type: argon2id });
  const today = dateOnly(todayDate());
  const start = daysAgo(today, 56);
  const days = [0, 2, 4].map(
    (offset) => (((today.getUTCDay() || 7) - 1 + offset) % 7) + 1,
  );
  const createdFiles: string[] = [];
  try {
    await db.$transaction(
      async (tx) => {
        const accounts = [
          [
            'coach',
            'coach.presentacion@example.com',
            'Coach Presentación',
            Role.COACH,
          ],
          [
            'student-0',
            'alumno.presentacion@example.com',
            'Alex Demo · Progresión',
            Role.STUDENT,
          ],
          [
            'student-1',
            'alumno2.presentacion@example.com',
            'Daniela Demo · Constancia',
            Role.STUDENT,
          ],
          [
            'student-2',
            'alumno3.presentacion@example.com',
            'Tomás Demo · Retorno',
            Role.STUDENT,
          ],
        ] as const;
        for (const [key, email, name, role] of accounts) {
          const existing = await tx.user.findUnique({ where: { email } });
          if (
            existing &&
            (existing.id !== id(key) ||
              existing.role !== role ||
              (role === Role.STUDENT && existing.coachId !== id('coach')))
          ) {
            throw new Error(`Cuenta ajena a esta demo: ${email}`);
          }
          await tx.user.upsert({
            where: { id: id(key) },
            update: {},
            create: {
              id: id(key),
              email,
              name,
              role,
              passwordHash,
              coachId: role === Role.STUDENT ? id('coach') : null,
            },
          });
          if (process.env.DEMO_SYNC_PASSWORD === '1') {
            await tx.user.update({
              where: { id: id(key) },
              data: { passwordHash, tokenVersion: { increment: 1 } },
            });
            await tx.refreshSession.updateMany({
              where: { userId: id(key), revokedAt: null },
              data: { revokedAt: new Date() },
            });
          }
          await tx.userProfile.upsert({
            where: { userId: id(key) },
            update: {},
            create: {
              userId: id(key),
              displayName: name,
              city: 'Santiago',
              sport: 'Powerlifting',
              birthDate: dateOnly('1998-05-12'),
              bio: 'Perfil ficticio para presentar planificación, seguimiento y comunicación. Datos sintéticos.',
            },
          });
        }
        const names = [
          'Press banca',
          'Remo con barra',
          'Press militar',
          'Curl de bíceps',
          'Extensión de tríceps',
          'Curl de muñeca',
          'Crunch en polea',
          'Sentadilla',
          'Peso muerto rumano',
          'Hip thrust',
          'Elevación de talones',
        ];
        for (const [index, group] of MUSCLE_GROUPS.entries()) {
          await tx.exercise.upsert({
            where: { id: id(`exercise-${index}`) },
            update: {},
            create: {
              id: id(`exercise-${index}`),
              coachId: id('coach'),
              name: `${names[index]} (presentación)`,
              muscleGroup: group.label,
              muscleGroups: [group.key],
              sports: ['powerlifting', 'general'],
              instructions:
                'Ejemplo de prescripción: movimiento controlado, rango cómodo y descanso indicado por el coach.',
            },
          });
        }
        await tx.exercise.upsert({
          where: { id: id('exercise-archived') },
          update: {},
          create: {
            id: id('exercise-archived'),
            coachId: id('coach'),
            name: 'Ejercicio archivado (presentación)',
            isActive: false,
          },
        });
        for (const [key, weeks, name] of [
          ['current', 12, 'Preparación de fuerza · 12 semanas'],
          ['past', 4, 'Base técnica · ciclo terminado'],
          ['template', 4, 'Plantilla para duplicar y editar'],
        ] as const) {
          await tx.program.upsert({
            where: { id: id(key) },
            update: {},
            create: {
              id: id(key),
              coachId: id('coach'),
              name,
              durationWeeks: weeks,
              description:
                'Plan ficticio de presentación. Incluye series, repeticiones, RPE, RIR, descansos y notas.',
              blocks: {
                create: Array.from({ length: weeks / 4 }, (_, block) => ({
                  name: ['Acumulación', 'Intensificación', 'Puesta a punto'][
                    block
                  ],
                  order: block + 1,
                  weeks: {
                    create: Array.from({ length: 4 }, (_, week) => ({
                      number: block * 4 + week + 1,
                      order: week + 1,
                      sessions: {
                        create: days.map((day, session) => ({
                          name: [
                            'Fuerza A · tren inferior',
                            'Fuerza B · empuje',
                            'Fuerza C · tirón',
                          ][session],
                          dayOfWeek: day,
                          order: session + 1,
                          sessionExercises: {
                            create: [7, 0, 1, [9, 2, 8][session]].map(
                              (exercise, order) => ({
                                exerciseId: id(`exercise-${exercise}`),
                                order: order + 1,
                                targetSets: 3,
                                targetRepsMin: 6,
                                targetRepsMax: 8,
                                targetRpe: 7 + block * 0.5,
                                targetRir: 2,
                                restSeconds: 120,
                                notes:
                                  'Registrar carga, repeticiones y esfuerzo de cada serie.',
                              }),
                            ),
                          },
                        })),
                      },
                    })),
                  },
                })),
              },
            },
          });
        }
        for (let athlete = 0; athlete < 3; athlete++) {
          const studentId = id(`student-${athlete}`);
          for (const key of ['past', 'current']) {
            const assignmentId = id(`${key}-assignment-${athlete}`);
            const assignment = await tx.programAssignment.upsert({
              where: { id: assignmentId },
              update: {},
              create: {
                id: assignmentId,
                programId: id(key),
                studentId,
                status: key === 'past' ? 'FINISHED' : 'ACTIVE',
                startDate: key === 'past' ? daysAgo(start, 28) : start,
                assignedAt:
                  key === 'past' ? daysAgo(start, 29) : daysAgo(start, 1),
              },
            });
            const sessions = await tx.session.findMany({
              where: { week: { block: { programId: id(key) } } },
              orderBy: [{ week: { number: 'asc' } }, { order: 'asc' }],
              include: {
                week: true,
                sessionExercises: {
                  include: { exercise: true },
                  orderBy: { order: 'asc' },
                },
              },
            });
            for (const [index, session] of sessions.entries()) {
              const scheduled = dateOnly(
                sessionDate(
                  assignment.startDate,
                  session.week.number - 1,
                  session.dayOfWeek,
                )!,
              );
              if (scheduled >= today) continue;
              const status =
                index % (athlete === 2 ? 4 : 11) === 3
                  ? 'SKIPPED'
                  : index % 7 === 5
                    ? 'PARTIAL'
                    : 'COMPLETED';
              await tx.workoutLog.upsert({
                where: { id: id(`${key}-workout-${athlete}-${index}`) },
                update: {},
                create: {
                  id: id(`${key}-workout-${athlete}-${index}`),
                  studentId,
                  sessionId: session.id,
                  programAssignmentId: assignmentId,
                  performedAt: new Date(scheduled.getTime() + 18 * 3600000),
                  completionStatus: status,
                  durationMinutes:
                    status === 'SKIPPED'
                      ? 0
                      : status === 'PARTIAL'
                        ? 25
                        : 50 + (index % 12),
                  overallRpe: status === 'SKIPPED' ? null : 6 + (index % 3),
                  fatigue: status === 'SKIPPED' ? null : 2 + (index % 5),
                  comments:
                    status === 'SKIPPED'
                      ? 'Descanso registrado (dato sintético).'
                      : 'Sesión de demostración: progreso gradual y técnica controlada.',
                  prescriptionCapturedAt: scheduled,
                  prescriptions: {
                    create: session.sessionExercises.map(capturePrescription),
                  },
                  setLogs: {
                    create:
                      status === 'SKIPPED'
                        ? []
                        : session.sessionExercises.flatMap(
                            (exercise, position) =>
                              Array.from(
                                { length: status === 'PARTIAL' ? 1 : 3 },
                                (_, set) => ({
                                  sessionExerciseId: exercise.id,
                                  setNumber: set + 1,
                                  actualReps: 8 - set,
                                  actualLoad:
                                    30 +
                                    athlete * 10 +
                                    position * 7.5 +
                                    Math.floor(index / 3) * 2.5 +
                                    (key === 'current' ? 10 : 0),
                                  actualRpe: 6 + set * 0.5 + (index % 2),
                                  actualRir: 3 - set,
                                  comments:
                                    set === 0
                                      ? 'Primera serie: técnica revisada.'
                                      : null,
                                }),
                              ),
                          ),
                  },
                },
              });
            }
            if (key === 'current') {
              const future = sessions.find(
                (s) =>
                  sessionDate(
                    assignment.startDate,
                    s.week.number - 1,
                    s.dayOfWeek,
                  )! > today.toISOString().slice(0, 10),
              );
              if (future) {
                const originalDate = dateOnly(
                  sessionDate(
                    assignment.startDate,
                    future.week.number - 1,
                    future.dayOfWeek,
                  )!,
                );
                await tx.sessionScheduleOverride.upsert({
                  where: {
                    programAssignmentId_sessionId: {
                      programAssignmentId: assignmentId,
                      sessionId: future.id,
                    },
                  },
                  update: {},
                  create: {
                    programAssignmentId: assignmentId,
                    sessionId: future.id,
                    originalDate,
                    scheduledDate: daysAgo(originalDate, -1),
                    createdByUserId: id('coach'),
                    reason: 'Cambio de horario laboral (demo).',
                  },
                });
              }
            }
          }
          for (const [key, offset, status, name] of [
            ['past', 35, 'COMPLETED', 'Torneo regional completado'],
            ['today', 0, 'UPCOMING', 'Control técnico de hoy'],
            ['future', -21, 'UPCOMING', 'Campeonato de fuerza'],
            ['cancelled', -7, 'CANCELLED', 'Encuentro suspendido'],
          ] as const) {
            await tx.competition.upsert({
              where: { id: id(`competition-${athlete}-${key}`) },
              update: {},
              create: {
                id: id(`competition-${athlete}-${key}`),
                studentId,
                name: `${name} (demo)`,
                category: 'Open',
                eventDate: daysAgo(today, offset),
                status,
                location: 'Centro deportivo · Santiago',
                goal: 'Completar los intentos con buena técnica.',
                coachGoal: 'Gestionar esfuerzo y respetar descansos.',
                notes:
                  'Evento ficticio de presentación; no corresponde a una inscripción real.',
              },
            });
          }
          for (let message = 0; message < 6; message++) {
            await tx.message.upsert({
              where: { id: id(`message-${athlete}-${message}`) },
              update: {},
              create: {
                id: id(`message-${athlete}-${message}`),
                senderId: message % 2 ? studentId : id('coach'),
                receiverId: message % 2 ? id('coach') : studentId,
                body: [
                  'Ya tienes tu programa y objetivos.',
                  'Revisé los bloques y el calendario.',
                  'Reprogramé la próxima sesión por tu horario.',
                  'Registré mis series y mi esfuerzo.',
                  'Revisemos tu evolución antes de la competencia.',
                  'Adjunto material de prueba para mostrar el chat.',
                ][message],
                createdAt: new Date(today.getTime() - (6 - message) * 3600000),
                readAt: message < 4 ? new Date() : null,
              },
            });
          }
          for (const [recipient, type, title] of [
            [studentId, 'PROGRAM_ASSIGNED', 'Plan de 12 semanas disponible'],
            [
              studentId,
              'SESSION_RESCHEDULED',
              'Sesión reprogramada por tu coach',
            ],
            [
              studentId,
              'COMPETITION_GOAL_UPDATED',
              'Objetivo de competencia actualizado',
            ],
            [
              id('coach'),
              'WORKOUT_COMPLETED',
              'Nuevo entrenamiento registrado',
            ],
            [id('coach'), 'NEW_MESSAGE', 'Tu alumno compartió una consulta'],
          ] as const) {
            const dedupeKey = `showcase:${athlete}:${type}`;
            await tx.notification.upsert({
              where: { dedupeKey },
              update: {},
              create: {
                userId: recipient,
                type,
                title,
                body: 'Notificación sintética de presentación.',
                dedupeKey,
                resourceType: 'student',
                resourceId: studentId,
              },
            });
          }
        }
        // Synthetic import previews use the same validation as actual uploads.
        for (const invalid of [false, true]) {
          const key = invalid ? 'import-invalid' : 'import-valid';
          const cells = {
            program_name: 'Programa importado (presentación)',
            duration_weeks: 1,
            block_name: 'Bloque importado',
            block_order: 1,
            week_number: 1,
            week_order: 1,
            session_name: 'Sesión importada',
            day_of_week: days[0],
            session_order: 1,
            exercise_name: 'Sentadilla (presentación)',
            exercise_order: 1,
            target_sets: invalid ? -3 : 3,
            target_reps_min: 6,
            target_reps_max: 8,
            target_rpe: 7,
            target_rir: 2,
            rest_seconds: 120,
          };
          const { values, errors } = validateExcelRow(cells, id('exercise-7'));
          await tx.excelImportBatch.upsert({
            where: { id: id(key) },
            update: {},
            create: {
              id: id(key),
              coachId: id('coach'),
              originalFilename: `${key}-sintetico.xlsx`,
              rows: {
                create: [
                  {
                    rowNumber: 2,
                    rawData: { cells, normalized: values },
                    status: errors.length ? 'INVALID' : 'VALID',
                    errors: errors.map((error) => ({ ...error })),
                  },
                ],
              },
            },
          });
        }
        // Real files behind private storage, including a playable test video.
        const root = resolve(process.env.CHAT_STORAGE_DIR || 'storage/chat');
        await mkdir(root, { recursive: true });
        for (const [key, source, type, mimeType, originalFilename] of [
          [
            '11111111-1111-4111-8111-111111111111',
            '../frontend/public/pwa-512x512.png',
            'IMAGE',
            'image/png',
            'imagen-demo.png',
          ],
          [
            '22222222-2222-4222-8222-222222222222',
            'test/fixtures/chat-video.webm',
            'VIDEO',
            'video/webm',
            'video-prueba.webm',
          ],
        ] as const) {
          const existing = await tx.messageAttachment.findUnique({
            where: { storageKey: key },
          });
          if (existing) {
            if (existing.messageId !== id('message-0-5'))
              throw new Error('Adjunto existente ajeno a esta demo.');
            continue;
          }
          const bytes = await readFile(resolve(source));
          const path = resolve(root, key);
          await writeFile(path, bytes, { flag: 'wx' });
          createdFiles.push(path);
          await tx.messageAttachment.create({
            data: {
              messageId: id('message-0-5'),
              type,
              storageKey: key,
              mimeType,
              originalFilename,
              sizeBytes: bytes.length,
            },
          });
        }
      },
      { timeout: 120000 },
    );
  } catch (error) {
    await Promise.all(createdFiles.map((path) => unlink(path)));
    throw error;
  }
  console.log(
    'Presentación creada: coach.presentacion@example.com y alumno.presentacion@example.com (+ alumno2 y alumno3).',
  );
  console.log(
    '12 semanas de historial por alumno, ciclo activo de 12 semanas, plantilla, 11 grupos musculares, competencias, reprogramaciones, chat y multimedia.',
  );
}
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Error de seed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
