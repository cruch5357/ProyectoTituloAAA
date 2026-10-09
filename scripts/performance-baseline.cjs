const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env'), quiet: true });
const { getAppTimezone } = require('../backend/config/app-timezone.cjs');
const timezone = getAppTimezone();
const base = process.env.PERF_API_URL || 'http://localhost:3000/api/v1';
async function main() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('Usa una API local para esta medición.');
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error('Define DEMO_PASSWORD para las cuentas demo (nunca se imprime).');
  async function login(email) {
    const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (!response.ok) throw new Error(`Login demo no disponible (HTTP ${response.status}). Comprueba DEMO_PASSWORD.`);
    return (await response.json()).data.accessToken;
  }
  const coachToken = await login(process.env.PERF_COACH_EMAIL || 'coach.demo@example.com');
  const studentToken = await login(process.env.PERF_STUDENT_EMAIL || 'alumno.demo@example.com');
  async function get(route, token) {
    const result = await fetch(`${base}${route}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!result.ok) throw new Error(`${route}: HTTP ${result.status}`);
    return result.json();
  }
  const profile = (await get('/profile/me', studentToken)).data;
  const summary = (await get('/dashboard/summary', coachToken)).data;
  const calendar = (await get('/calendar/me', studentToken)).data;
  const history = await get('/workout-logs?page=1&limit=20', studentToken);
  const operations = [
    ['Coach Dashboard', '/dashboard/summary', coachToken],
    ['Student Home (planificación)', '/calendar/me', studentToken],
    ['Calendar (coach)', `/students/${profile.id}/calendar`, coachToken],
    ['History', '/workout-logs?page=1&limit=20', studentToken],
    ['Notifications', '/notifications?page=1', studentToken],
    ['Messages list', `/messages/${profile.coach.id}?page=1`, studentToken],
  ];
  const rows = [];
  for (const [name, route, token] of operations) {
    for (let i = 0; i < 3; i++) await get(route, token);
    const samples = [];
    for (let i = 0; i < 15; i++) {
      const started = performance.now(); await get(route, token); samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    rows.push({ name, endpoint: route.replace(profile.id, ':studentId').replace(profile.coach.id, ':peerId'), avg: (samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2), p95: samples[Math.ceil(samples.length * 0.95) - 1].toFixed(2) });
  }
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const text = `# Baseline de rendimiento local — P1\n\nFecha: ${date} (${timezone}).\n\nEntorno: ${os.platform()} ${os.arch()}, Node ${process.version}, ${os.cpus()[0]?.model}, ${Math.round(os.totalmem() / 1024 ** 3)} GiB RAM. PostgreSQL local; API Nest compilada.\n\n${process.env.PERF_DATASET || "Dataset demo existente"}\n\nMedición del alumno: ${calendar.assignments.length} asignaciones activas y ${calendar.sessions.length} sesiones para el alumno medido; ${history.meta.total} entrenamientos registrados. Resumen agregado del Coach: ${JSON.stringify(summary)}. No se modifican contraseñas ni datos de entrenamiento.\n\nMétodo: login demo por variables de entorno; 3 warm-ups + 15 requests secuenciales por endpoint. Tiempo HTTP completo (incluye autenticación/ownership y parseo JSON). p95 por rango más próximo. No es un umbral de CI ni una garantía universal. Student Home tiene varias consultas: aquí se mide su planificación, no el tiempo total de renderizado de la página.\n\n| Operación | Endpoint | Promedio ms | p95 ms |\n|---|---|---:|---:|\n${rows.map((r) => `| ${r.name} | \`${r.endpoint}\` | ${r.avg} | ${r.p95} |`).join('\n')}\n\nNo se aplicaron optimizaciones especulativas ni índices de rendimiento adicionales. La agregación de finalización por sesión evita transferir todo el historial para calcular adherencia.\n\nRepetir: iniciar API local, definir DEMO_PASSWORD (y PERF_API_URL si corresponde), ejecutar \`npm run performance:baseline\`. Opcionales: PERF_COACH_EMAIL y PERF_STUDENT_EMAIL. El reporte se sobrescribe con cada medición. Nunca imprime tokens, cookies o contraseñas.\n`;
  fs.writeFileSync(path.join(__dirname, '../docs/performance-baseline.md'), text);
  console.table(rows);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
