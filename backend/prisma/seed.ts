/**
 * Seed de DESARROLLO — datos ficticios para poder probar manualmente las
 * relaciones Coach/Alumno una vez que exista una base de datos PostgreSQL
 * real (docs/database.md, docs/roadmap.md).
 *
 * IMPORTANTE:
 * - Todos los datos son ficticios (nombres y correos de ejemplo).
 * - `passwordHash` NO contiene un hash real: el hashing de contraseñas se
 *   implementa recién en PROMPT 03. El valor aquí es un texto plano
 *   claramente marcado, nunca una contraseña ni un hash válido, y este seed
 *   nunca debe ejecutarse contra una base de datos de producción.
 * - Este script no se ejecuta en este prompt: requiere `npx prisma generate`
 *   y una base de datos PostgreSQL alcanzable, ninguna de las dos cosas
 *   disponibles en el entorno donde se preparó este seed (ver informe de
 *   PROMPT 02). Ejecutar con: `npm run prisma:seed` una vez configurado
 *   `DATABASE_URL` en `backend/.env`.
 */
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const DEV_SEED_PASSWORD_PLACEHOLDER = 'DEV_SEED_NO_REAL_HASH';

async function main() {
  const coach = await prisma.user.upsert({
    where: { email: 'coach.demo@example.com' },
    update: {},
    create: {
      email: 'coach.demo@example.com',
      passwordHash: DEV_SEED_PASSWORD_PLACEHOLDER,
      role: Role.COACH,
      name: 'Coach Demo',
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'alumno.demo@example.com' },
    update: {},
    create: {
      email: 'alumno.demo@example.com',
      passwordHash: DEV_SEED_PASSWORD_PLACEHOLDER,
      role: Role.STUDENT,
      name: 'Alumno Demo',
      coachId: coach.id,
    },
  });

  const squat = await prisma.exercise.upsert({
    where: { id: 'seed-exercise-sentadilla' },
    update: {},
    create: {
      id: 'seed-exercise-sentadilla',
      coachId: coach.id,
      name: 'Sentadilla trasera',
      muscleGroup: 'Piernas',
      instructions: 'Ejemplo de datos de desarrollo, no es contenido real.',
    },
  });

  const program = await prisma.program.upsert({
    where: { id: 'seed-program-fuerza' },
    update: {},
    create: {
      id: 'seed-program-fuerza',
      coachId: coach.id,
      name: 'Programa de fuerza (demo)',
      durationWeeks: 1,
      blocks: {
        create: {
          name: 'Bloque 1 (demo)',
          order: 1,
          weeks: {
            create: {
              number: 1,
              order: 1,
              sessions: {
                create: {
                  name: 'Sesión A (demo)',
                  order: 1,
                  sessionExercises: {
                    create: {
                      exerciseId: squat.id,
                      order: 1,
                      targetSets: 3,
                      targetRepsMin: 8,
                      targetRepsMax: 10,
                      targetRpe: 7,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  await prisma.programAssignment.upsert({
    where: { id: 'seed-assignment-demo' },
    update: {},
    create: {
      id: 'seed-assignment-demo',
      programId: program.id,
      studentId: student.id,
    },
  });

  console.log('Seed de desarrollo aplicado: 1 coach, 1 alumno, 1 programa de ejemplo.');
}

main()
  .catch((error) => {
    console.error('Error al ejecutar el seed de desarrollo:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
