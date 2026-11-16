#!/usr/bin/env node
/**
 * End-to-end API validation of flexible weekly training, through the Vite
 * proxy exactly as the browser calls it.
 *
 * It creates a fresh disposable QA athlete (backend `demo:flexible -- --qa`)
 * and exercises it; the showcase demo athlete is only read. Nothing is
 * deleted. Requires both dev servers running and a prior `demo:flexible` run.
 *
 * Usage (repo root): node scripts/validate-flexible-demo.cjs
 *   FRONTEND_URL=http://127.0.0.1:5173  BACKEND_URL=http://127.0.0.1:3001
 */
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const ROOT = resolve(__dirname, '..');
const FRONTEND = process.env.FRONTEND_URL ?? 'http://127.0.0.1:5173';
const BACKEND = process.env.BACKEND_URL ?? 'http://127.0.0.1:3001';
const API = `${FRONTEND}/api/v1`;
const DEMO_STUDENT = 'alumna.flexible.demo@example.com';

const results = [];
function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'OK  ' : 'FAIL'} ${name}${condition || detail === undefined ? '' : ` -> ${JSON.stringify(detail).slice(0, 300)}`}`);
}

async function call(method, path, { token, body, headers = {}, base = API } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, json, data: json?.data, response };
}

async function login(email, password) {
  const result = await call('POST', '/auth/login', { body: { email, password } });
  if (result.status !== 200 && result.status !== 201)
    throw new Error(`No se pudo iniciar sesión como ${email}: ${result.status}`);
  // Keep only live cookies, as a browser would: login also clears a legacy
  // path-scoped csrf_token with an empty value.
  const cookies = result.response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .filter((pair) => !pair.endsWith('='));
  return { token: result.data.accessToken, cookies };
}

const addDays = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const message = (result) => String(result.json?.error?.message ?? result.json?.message ?? '');

async function main() {
  // A fresh QA athlete keeps every run independent from earlier ones.
  const setup = spawnSync('npm', ['run', '--silent', 'demo:flexible', '--', '--qa'], {
    cwd: resolve(ROOT, 'backend'),
    env: { ...process.env, DEMO_FLEX_CONFIRM: '1' },
    encoding: 'utf8',
    shell: process.platform === 'win32', // npm is a .cmd shim on Windows; arguments are fixed literals.
  });
  if (setup.status !== 0) throw new Error(`Falló la preparación QA: ${setup.stderr || setup.stdout}`);
  const qaRun = JSON.parse(setup.stdout.trim().split('\n').at(-1));
  const password = readFileSync(resolve(ROOT, '.env.demo-flexible'), 'utf8')
    .match(/^DEMO_FLEX_PASSWORD=(.+)$/m)[1]
    .trim();
  console.log(`QA: ${qaRun.qa.email}`);

  // --- Proxy Vite y autenticación ---
  const viaProxy = await call('GET', '/health');
  const direct = await call('GET', '/health', { base: `${BACKEND}/api/v1` });
  check('Proxy Vite: /api/v1/health responde como el backend', viaProxy.status === 200 && direct.status === 200, [viaProxy.status, direct.status]);
  check('Auth: sin token se rechaza (401)', (await call('GET', '/training/me')).status === 401);
  const wrong = await call('POST', '/auth/login', { body: { email: qaRun.qa.email, password: `${password}x` } });
  check('Auth: contraseña incorrecta se rechaza (401)', wrong.status === 401, wrong.status);
  const qaSession = await login(qaRun.qa.email, password);
  const qa = qaSession.token;
  const coach = (await login(qaRun.coach.email, password)).token;
  const me = await call('GET', '/users/me', { token: qa });
  check('Auth: /users/me identifica al alumno QA', me.data?.email === qaRun.qa.email, me.data);
  check('Auth: un alumno no accede a rutas de coach (403)', (await call('GET', '/students', { token: qa })).status === 403);
  // The SPA reads the decoded cookie value, as cookie-parser does.
  const csrfCookie = qaSession.cookies.find((cookie) => cookie.startsWith('csrf_token='));
  const csrf = csrfCookie && decodeURIComponent(csrfCookie.slice('csrf_token='.length));
  const refresh = await call('POST', '/auth/refresh', {
    headers: {
      cookie: qaSession.cookies.join('; '),
      'X-CSRF-Token': csrf ?? '',
    },
  });
  check('Auth: refresh con cookie + CSRF entrega un nuevo token', [200, 201].includes(refresh.status) && refresh.data?.accessToken, refresh.status);

  // --- Estado inicial del QA ---
  let overview = (await call('GET', '/training/me', { token: qa })).data;
  const today = overview.today;
  const assignment = overview.assignments.find((item) => item.status === 'ACTIVE');
  const plan = overview.weekPlan;
  check('Bloque activo de 4 semanas', assignment?.weekCount === 4, assignment);
  check('3 sesiones prescritas por semana', overview.sessions.length === 12 && assignment.currentWeek?.prescribedSessions === 3, overview.sessions.length);
  check('Semana disponible de lunes a domingo', weekday(plan.weekStart) === 1 && weekday(plan.weekEnd) === 0 && addDays(plan.weekStart, 6) === plan.weekEnd, plan);
  check('Sin organización previa: NO_PLAN y revisión 0', plan.revision === 0 && plan.assessment.code === 'NO_PLAN', plan.assessment);
  check('Adherencia de la semana vencida: 2 de 3', assignment.adherence.scheduledSessions === 3 && assignment.adherence.completedSessions === 2, assignment.adherence);
  check('Sesión vencida pendiente detectada', overview.pendingSession?.weekNumber === 1, overview.pendingSession);

  // --- Planificación flexible ---
  const savePlan = (trainingDates, revision) =>
    call('PATCH', '/training/week-plan', { token: qa, body: { assignmentId: plan.assignmentId, weekIndex: plan.weekIndex, revision, trainingDates } });
  const outside = await savePlan([addDays(plan.weekEnd, 1)], 0);
  check('Plan: rechaza días fuera de la semana (400)', outside.status === 400, outside.json);
  check('Plan: rechaza días repetidos (400)', (await savePlan([plan.weekStart, plan.weekStart], 0)).status === 400);
  check('Plan: rechaza más días que sesiones (400)', (await savePlan([0, 2, 4, 6].map((d) => addDays(plan.weekStart, d)), 0)).status === 400);
  const consecutive = await savePlan([0, 1, 2].map((d) => addDays(plan.weekStart, d)), 0);
  check('Plan: 3 días seguidos se guardan con advertencia THREE_CONSECUTIVE', consecutive.status === 200 && consecutive.data.assessment.code === 'THREE_CONSECUTIVE' && consecutive.data.assessment.level === 'CAUTION', consecutive.data?.assessment);
  let coachNotices = (await call('GET', '/notifications?page=1', { token: coach })).data;
  const planWarning = coachNotices.find((notice) => notice.type === 'TRAINING_PLAN_WARNING' && notice.resourceId === qaRun.qa.id && notice.body.includes('3 días'));
  check('Coach: recibe alerta por 3 días seguidos con enlace al alumno', planWarning?.resourceType === 'student', planWarning);
  const stale = await savePlan([0, 2, 4].map((d) => addDays(plan.weekStart, d)), 0);
  check('Plan: revisión obsoleta no sobrescribe (409)', stale.status === 409, stale.status);
  const balanced = await savePlan([0, 2, 4].map((d) => addDays(plan.weekStart, d)), consecutive.data.revision);
  check('Plan: días alternados con descanso quedan BALANCED', balanced.status === 200 && balanced.data.assessment.code === 'BALANCED' && balanced.data.assessment.restDays === 4, balanced.data?.assessment);
  overview = (await call('GET', '/training/me', { token: qa })).data;
  check('Plan: la organización guardada se refleja en el resumen', JSON.stringify(overview.weekPlan.trainingDates) === JSON.stringify(balanced.data.trainingDates), overview.weekPlan);

  // --- Cierre de la sesión vencida ---
  const pending = overview.pendingSession;
  const closed = await call('POST', `/training/sessions/${pending.sessionId}/close`, { token: qa, body: { assignmentId: pending.assignmentId } });
  check('Cierre: la sesión vencida se cierra como omitida', closed.status === 201 || closed.status === 200, closed.json);
  overview = (await call('GET', '/training/me', { token: qa })).data;
  check('Cierre: ya no queda sesión pendiente', overview.pendingSession === null, overview.pendingSession);

  // --- Inicio, continuación, guardado y cierre ---
  const current = overview.sessions.filter((session) => session.weekNumber === plan.weekIndex + 1);
  const [first, second] = current;
  const start = await call('POST', `/training/sessions/${first.sessionId}/start`, { token: qa, body: { assignmentId: first.assignmentId } });
  check('Inicio: la sesión queda en curso', [200, 201].includes(start.status) && start.data?.revision === 0, start.json);
  const blockedOpen = await call('POST', `/training/sessions/${second.sessionId}/start`, { token: qa, body: { assignmentId: second.assignmentId } });
  check('Inicio: no permite otra sesión con una en curso (409)', blockedOpen.status === 409, message(blockedOpen));
  const sets = start.data.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({ sessionExerciseId: exercise.id, setNumber: set.setNumber, status: 'RECORDED', weight: set.weight ?? 20, reps: set.reps ?? 8, rpe: 8 })),
  );
  const firstSave = await call('PATCH', `/training/sessions/${first.sessionId}`, { token: qa, body: { assignmentId: first.assignmentId, revision: 0, finish: false, sets: sets.slice(0, 2) } });
  check('Guardado: registra series sin cerrar', firstSave.status === 200 && firstSave.data.revision === 1 && !firstSave.data.finished, firstSave.json);
  const resumed = await call('POST', `/training/sessions/${first.sessionId}/start`, { token: qa, body: { assignmentId: first.assignmentId } });
  const recorded = resumed.data?.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.status === 'RECORDED').length;
  check('Continuación: reabrir la sesión conserva las series guardadas', [200, 201].includes(resumed.status) && recorded === 2, resumed.json);
  const staleSave = await call('PATCH', `/training/sessions/${first.sessionId}`, { token: qa, body: { assignmentId: first.assignmentId, revision: 0, finish: false, sets: sets.slice(0, 3) } });
  check('Guardado: revisión obsoleta se rechaza (409)', staleSave.status === 409, staleSave.status);
  const finished = await call('PATCH', `/training/sessions/${first.sessionId}`, { token: qa, body: { assignmentId: first.assignmentId, revision: 1, finish: true, sets } });
  check('Cierre: finaliza COMPLETED con todas las series', finished.status === 200 && finished.data.finished && finished.data.status === 'COMPLETED', finished.data && { status: finished.data.status, finished: finished.data.finished });
  const reStart = await call('POST', `/training/sessions/${first.sessionId}/start`, { token: qa, body: { assignmentId: first.assignmentId } });
  check('Cierre: un entrenamiento finalizado no se reinicia (409)', reStart.status === 409, message(reStart));
  coachNotices = (await call('GET', '/notifications?page=1', { token: coach })).data;
  check('Notificación: el coach recibe WORKOUT_COMPLETED del alumno', coachNotices.some((notice) => notice.type === 'WORKOUT_COMPLETED' && notice.resourceId === qaRun.qa.id), coachNotices.map((notice) => notice.type));

  // --- Máximo un entrenamiento por día ---
  const secondToday = await call('POST', `/training/sessions/${second.sessionId}/start`, { token: qa, body: { assignmentId: second.assignmentId } });
  check('Límite diario: segundo entrenamiento del día rechazado (409)', secondToday.status === 409 && message(secondToday).includes('un entrenamiento por día'), message(secondToday));
  overview = (await call('GET', '/training/me', { token: qa })).data;
  const blockedSecond = overview.sessions.find((session) => session.id === second.id);
  check('Límite diario: el resumen bloquea las demás sesiones hoy', blockedSecond.availability === 'BLOCKED' && !blockedSecond.canStart, blockedSecond);

  // --- Historial, evolución, adherencia y calendario ---
  const history = await call('GET', '/workout-logs?limit=20', { token: qa });
  check('Historial: incluye el entrenamiento de hoy finalizado', history.data.some((log) => log.sessionId === first.sessionId && log.completionStatus === 'COMPLETED' && log.finishedAt), history.meta);
  const exerciseId = start.data.exercises[0].exerciseId;
  const evolution = await call('GET', `/workout-logs/evolution?exerciseId=${exerciseId}`, { token: qa });
  check('Evolución: resumen y puntos del ejercicio disponibles', evolution.status === 200 && evolution.data.summary.totalWorkouts >= 3 && evolution.data.exerciseEvolution?.length >= 2, evolution.data?.summary);
  check('Adherencia: la semana vencida queda finalizada 3 de 3', overview.assignments[0].adherence.completedSessions === 3, overview.assignments[0].adherence);
  const calendar = await call('GET', `/calendar/me?month=${today.slice(0, 7)}`, { token: qa });
  check('Calendario (alumno): ubica el entrenamiento de hoy', calendar.status === 200 && calendar.data.sessions.some((session) => session.actualDate === today && session.completed), calendar.status);
  const coachCalendar = await call('GET', `/students/${qaRun.qa.id}/calendar?month=${today.slice(0, 7)}`, { token: coach });
  check('Calendario (coach): ve el mismo entrenamiento del alumno', coachCalendar.status === 200 && coachCalendar.data.sessions.some((session) => session.actualDate === today), coachCalendar.status);

  // --- Alerta de 5+ sesiones y límite diario entre ciclos ---
  const assign = await call('POST', `/students/${qaRun.qa.id}/block-assignments`, { token: coach, body: { blockId: qaRun.highFrequencyBlockId, startDate: today, replaceActive: true } });
  check('Asignación: el coach asigna un bloque de 5 sesiones', [200, 201].includes(assign.status), assign.json);
  coachNotices = (await call('GET', '/notifications?page=1', { token: coach })).data;
  const loadWarning = coachNotices.find((notice) => notice.type === 'TRAINING_PLAN_WARNING' && notice.body.includes('hasta 5 entrenamientos') && notice.resourceId === qaRun.qa.id);
  check('Coach: alerta por 5 o más sesiones semanales', loadWarning?.resourceType === 'student', loadWarning);
  const qaNotices = (await call('GET', '/notifications?page=1', { token: qa })).data;
  check('Notificación: el alumno recibe el nuevo ciclo', qaNotices.some((notice) => notice.type === 'PROGRAM_ASSIGNED' && notice.body.includes('Alta frecuencia')), qaNotices.map((notice) => notice.title));
  overview = (await call('GET', '/training/me', { token: qa })).data;
  check('Plan 5+: la semana se evalúa como HIGH_FREQUENCY', overview.weekPlan?.assessment.code === 'HIGH_FREQUENCY', overview.weekPlan?.assessment);
  const newCycle = overview.sessions.find((session) => session.cycleStatus === 'ACTIVE');
  check('Límite diario entre ciclos: el ciclo nuevo queda bloqueado hoy', newCycle.availability === 'BLOCKED', newCycle);
  const crossCycle = await call('POST', `/training/sessions/${newCycle.sessionId}/start`, { token: qa, body: { assignmentId: newCycle.assignmentId } });
  check('Límite diario entre ciclos: iniciar se rechaza (409)', crossCycle.status === 409, message(crossCycle));

  // --- Alumna demo (solo lectura) ---
  const demo = (await login(DEMO_STUDENT, password)).token;
  const demoOverview = (await call('GET', '/training/me', { token: demo })).data;
  const demoAssignment = demoOverview.assignments[0];
  check('Demo: ciclo activo de 4 semanas x 3 sesiones', demoAssignment.weekCount === 4 && demoOverview.sessions.length === 12, demoAssignment);
  check('Demo: adherencia 100% en semanas vencidas', demoAssignment.adherence.adherenceRate === 100, demoAssignment.adherence);
  check('Demo: organización semanal guardada y equilibrada', demoOverview.weekPlan?.trainingDates.length === 3 && demoOverview.weekPlan.assessment.level === 'BALANCED', demoOverview.weekPlan);
  const demoHistory = await call('GET', '/workout-logs?limit=1', { token: demo });
  check('Demo: historial con 16 registros', demoHistory.json.meta?.total === 16, demoHistory.json.meta);
  const demoEvolution = await call('GET', '/workout-logs/evolution', { token: demo });
  check('Demo: evolución con 3 entrenamientos por semana', Math.round(demoEvolution.data.summary.trainingFrequencyPerWeek) === 3, demoEvolution.data.summary);

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificaciones OK`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
