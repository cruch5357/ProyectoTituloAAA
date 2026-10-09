const { getAppTimezone } = require('../../backend/config/app-timezone.cjs');
import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const { PrismaClient } = require('../../backend/node_modules/@prisma/client');
const argon2 = require('../../backend/node_modules/argon2');
const db = new PrismaClient();
const suffix = randomUUID();
const password = `Browser-${suffix}-1`;
const coachEmail = `browser-coach-${suffix}@example.invalid`;
const studentEmail = `browser-student-${suffix}@example.invalid`;
let coachId: string, studentId: string, programId: string, sessionId: string;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: getAppTimezone() }).format(new Date());
const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL(email === coachEmail ? /\/dashboard$/ : /\/home$/);
}
async function screenshots(page: Page, name: string) {
  if (!process.env.P1_SCREENSHOTS) return;
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: test.info().outputPath(`${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
test.describe.serial('P1 browser journeys', () => {
  test.beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    coachId = (await db.user.create({ data: { email: coachEmail, name: 'Coach navegador', role: 'COACH', passwordHash } })).id;
    studentId = (await db.user.create({ data: { email: studentEmail, name: 'Atleta navegador', role: 'STUDENT', coachId, passwordHash } })).id;
    const exercise = await db.exercise.create({ data: { coachId, name: 'Sentadilla navegador' } });
    const program = await db.program.create({ data: { coachId, name: 'Plan navegador', blocks: { create: { name: 'Base navegador', order: 1,
      weeks: { create: { number: 1, order: 1, sessions: { create: { name: 'Sesión navegador', order: 1, dayOfWeek: new Date(`${today}T12:00:00Z`).getUTCDay() || 7,
        sessionExercises: { create: { exerciseId: exercise.id, order: 1, targetSets: 1, targetRepsMin: 5, targetRepsMax: 5 } },
      } } } },
    } } }, include: { blocks: { include: { weeks: { include: { sessions: true } } } } } });
    programId = program.id; sessionId = program.blocks[0].weeks[0].sessions[0].id;
    await db.programAssignment.create({ data: { programId, studentId, startDate: new Date(`${today}T00:00:00Z`) } });
  });
  test.afterAll(async () => {
    // Exact generated owner IDs only; never reset the database.
    if (studentId) await db.workoutLog.deleteMany({ where: { studentId } });
    if (coachId) {
      await db.program.deleteMany({ where: { coachId } });
      await db.exercise.deleteMany({ where: { coachId } });
      await db.auditLog.deleteMany({ where: { actorId: { in: [coachId, studentId].filter(Boolean) } } });
    }
    if (studentId) await db.user.delete({ where: { id: studentId } });
    if (coachId) await db.user.delete({ where: { id: coachId } });
    await db.$disconnect();
  });
  test('login and role navigation', async ({ page, browser }) => {
    await login(page, coachEmail);
    await expect(page.getByRole('link', { name: 'Mis alumnos', exact: true }).first()).toBeVisible();
    const context = await browser.newContext();
    const studentPage = await context.newPage();
    await login(studentPage, studentEmail);
    await expect(studentPage.getByRole('heading', { name: 'Adherencia del programa' })).toBeVisible();
    await context.close();
  });
  test('coach duplicates prescription and sees copied exercises', async ({ page }) => {
    await login(page, coachEmail);
    await page.goto(`/programs/${programId}`);
    await page.getByRole('button', { name: 'Duplicar programa', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Programa duplicado' })).toBeVisible();
    await page.getByRole('link', { name: 'Abrir copia', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plan navegador (copia)', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Duplicar semana', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Duplicar semana', exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Ver sesiones', exact: true }).first().click();
    await page.getByRole('button', { name: 'Duplicar sesión', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Duplicar sesión', exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Ver ejercicios', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Sentadilla navegador', exact: true })).toBeVisible();
    await screenshots(page, 'duplication');
  });
  test('coach reschedules and student sees effective date', async ({ page, browser }) => {
    await login(page, coachEmail);
    await page.goto(`/students/${studentId}?tab=calendar`);
    await page.getByRole('button', { name: 'Reprogramar Sesión navegador', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Reprogramar Sesión navegador' });
    await dialog.getByLabel('Nueva fecha').fill(tomorrow);
    await dialog.getByLabel('Motivo (opcional)').fill('Cambio de disponibilidad');
    await screenshots(page, 'reschedule');
    await dialog.getByRole('button', { name: 'Reprogramar', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const context = await browser.newContext();
    const studentPage = await context.newPage();
    await login(studentPage, studentEmail);
    await expect(studentPage.getByText('Próximo entrenamiento', { exact: true })).toBeVisible();
    await expect(studentPage.getByText('Sin programación suficiente', { exact: true })).toBeVisible();
    await studentPage.goto('/calendar');
    if (tomorrow.slice(0, 7) !== today.slice(0, 7)) await studentPage.getByRole('button', { name: 'Mes siguiente' }).click();
    await expect(studentPage.locator('section.calendar-day').filter({ has: studentPage.locator(`time[datetime="${tomorrow}"]`) }).getByText('Reprogramada')).toBeVisible();
    await expect(studentPage.getByRole('button', { name: 'Reprogramar Sesión navegador' })).toHaveCount(0);
    await screenshots(studentPage, 'calendar');
    await context.close();
  });
  test('student records workout and adherence updates', async ({ page, browser }) => {
    await login(page, coachEmail);
    await page.goto(`/students/${studentId}?tab=calendar`);
    if (tomorrow.slice(0, 7) !== today.slice(0, 7)) await page.getByRole('button', { name: 'Mes siguiente' }).click();
    await page.getByRole('button', { name: 'Reprogramar Sesión navegador' }).click();
    await page.getByRole('button', { name: 'Restablecer programación' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const context = await browser.newContext();
    const studentPage = await context.newPage();
    await login(studentPage, studentEmail);
    await studentPage.goto(`/student/sessions/${sessionId}`);
    await studentPage.getByRole('button', { name: 'Iniciar entrenamiento', exact: true }).click();
    await expect(studentPage).toHaveURL(/\/workout-logs\//);
    await studentPage.getByRole('combobox', { name: 'Ejercicio', exact: true }).selectOption({ label: '1. Sentadilla navegador' });
    await studentPage.getByLabel('Reps realizadas', { exact: true }).fill('5');
    await studentPage.getByLabel('Carga', { exact: true }).fill('20');
    await studentPage.getByRole('button', { name: 'Registrar serie', exact: true }).click();
    await expect(studentPage.getByRole('table').getByText('Sentadilla navegador', { exact: true })).toBeVisible();
    await studentPage.getByLabel('Duración (minutos)', { exact: true }).fill('30');
    await studentPage.getByRole('button', { name: 'Finalizar entrenamiento', exact: true }).click();
    await expect(studentPage.getByText('Resumen guardado.', { exact: true })).toBeVisible();
    await studentPage.goto('/home');
    await expect(studentPage.getByRole('region', { name: 'Adherencia del programa' })).toContainText('100%');
    await screenshots(studentPage, 'adherence');
    await context.close();
  });
});
