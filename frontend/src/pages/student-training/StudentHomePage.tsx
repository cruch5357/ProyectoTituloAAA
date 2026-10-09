import { displayTimestampDate } from '../../lib/calendarDate';
import { Adherence } from '../../components/coaching/Adherence';
import { useCalendar } from '../../api/coaching';
import { MyCoach, NextCompetition, SessionContext } from '../../components/coaching/Planning';
import { PersonalPerformance } from '../../components/ui/PersonalPerformance';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useMyProgramAssignments } from '../../api/programAssignments';
import {
  useStudentBlocks,
  useStudentWeeks,
  useStudentSessions,
  useStudentSessionDetail,
} from '../../api/studentTraining';
import {
  useSessionWorkoutLogs,
  useStartWorkoutLog,
  useWorkoutLogsHistory,
  useWorkoutEvolution,
} from '../../api/workoutLogs';
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../../components/ui/Primitives';

export function StudentHomePage({ training = false }: { training?: boolean }) {
  const { user } = useAuth();
  const assignments = useMyProgramAssignments();
  const history = useWorkoutLogsHistory({ page: 1, limit: 5 });
  const evolution = useWorkoutEvolution({});
  const inProgress = useWorkoutLogsHistory({
    page: 1,
    limit: 1,
    state: 'in-progress',
  });
  const pending = inProgress.data?.items[0];
  const calendar = useCalendar();
  const [selected, setSelected] = useState('');
  const active =
    assignments.data?.filter(
      (a) => a.status === 'ACTIVE' && a.program?.isActive,
    ) ?? [];
  const program =
    active.find((a) => a.programId === selected)?.program ?? active[0]?.program;
  return (
    <section>
      <PageHeader
        title={
          training ? 'Tu entrenamiento' : `Hola, ${user?.name ?? 'atleta'}`
        }
        description="Cada sesión cuenta. Encuentra tu programa y registra tu entrenamiento."
      />
      {inProgress.isLoading && (
        <Skeleton label="Buscando entrenamientos en curso…" />
      )}
      {inProgress.isError && (
        <ErrorState
          retry={() => void inProgress.refetch()}
          message="No pudimos comprobar si tienes un entrenamiento en curso."
        />
      )}
      {pending && (
        <section className="hero-card">
          <p className="eyebrow">Entrenamiento en curso</p>
          <h2>{pending.session?.name ?? 'Tu sesión'}</h2>
          <p>
            {pending.session?.week.block.program.name} ·{' '}
            {pending.session?.week.block.name} · Semana{' '}
            {pending.session?.week.number}
          </p>
          <Link
            className="button button--primary"
            to={`/workout-logs/${pending.id}`}
          >
            Continuar entrenamiento
          </Link>
        </section>
      )}
      {assignments.isLoading && <Skeleton label="Cargando tu entrenamiento…" />}
      {assignments.isError && (
        <ErrorState retry={() => void assignments.refetch()} />
      )}
      {assignments.isSuccess && !program && !pending && (
        <Card>
          <EmptyState
            title="Tu próximo paso empieza aquí"
            description="Aún no tienes un programa activo. Tu coach podrá asignarte uno para comenzar."
            action={
              <Link className="button" to="/my-programs">
                Ver mis programas
              </Link>
            }
          />
        </Card>
      )}
      {!pending && inProgress.isSuccess && calendar.data?.nextSession && <section className="hero-card">
        <p className="eyebrow">{calendar.data.nextSession.date === calendar.data.today ? 'Entrenamiento de hoy' : 'Próximo entrenamiento'}</p>
        <SessionContext session={calendar.data.nextSession} />
        {calendar.data.nextSession.date === calendar.data.today ? <SessionPreview sessionId={calendar.data.nextSession.sessionId} /> : <Link to={`/student/sessions/${calendar.data.nextSession.sessionId}`}>Ver entrenamiento</Link>}
      </section>}
      {calendar.data && <Card><Adherence assignments={calendar.data.assignments} /></Card>}
      {calendar.isError && <ErrorState retry={() => void calendar.refetch()} />}
      {program && !pending && !calendar.data?.nextSession && inProgress.isSuccess && (
        <section className="hero-card">
          <p className="eyebrow">Entrenamiento disponible</p>
          <h2>{program.name}</h2>
          <p className="muted">
            Selecciona el bloque, la semana y la sesión que vas a realizar.
          </p>
          {active.length > 1 && (
            <label className="field">
              Programa
              <select
                value={program.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {active.map((a) => (
                  <option key={a.id} value={a.programId}>
                    {a.program?.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <AvailableBlock key={program.id} programId={program.id} />
        </section>
      )}
      {!training && calendar.data && <NextCompetition competition={calendar.data.nextCompetition} today={calendar.data.today} />}
      {calendar.data?.pendingSession && <Card><h3>Sesión pasada sin finalizar</h3><SessionContext session={calendar.data.pendingSession} /><Link to={`/student/sessions/${calendar.data.pendingSession.sessionId}`}>Ver sesión</Link></Card>}
      {!training && (
        <>
          {evolution.isLoading && <Skeleton />}
          {evolution.isError && (
            <ErrorState retry={() => void evolution.refetch()} />
          )}
          {evolution.data && (
            <PersonalPerformance
              summary={evolution.data.summary}
              recent={evolution.data.recentPerformance}
              registered={history.data?.meta.total}
            />
          )}
          <MyCoach />
          <Card>
            <div className="page-header">
              <h2>Sesiones recientes</h2>
              <Link to="/history">Ver historial →</Link>
            </div>
            {history.isLoading && <Skeleton />}
            {history.isError && (
              <ErrorState retry={() => void history.refetch()} />
            )}
            {history.isSuccess && !history.data.items.length && (
              <EmptyState
                title="Sin entrenamientos registrados"
                description="Tus sesiones aparecerán aquí cuando empieces a entrenar."
              />
            )}
            <ul className="nested-list">
              {history.data?.items.map((log) => (
                <li key={log.id}>
                  <Link to={`/workout-logs/${log.id}`}>
                    {log.session?.name ?? 'Entrenamiento'}
                  </Link>
                  <p className="muted">
                    {displayTimestampDate(log.performedAt)} ·{' '}
                    {log.session?.week.block.program.name} ·{' '}
                    {log.durationMinutes === null
                      ? 'En curso'
                      : `${log.durationMinutes} min`}
                  </p>
                  {log.durationMinutes === null && (
                    <Link to={`/workout-logs/${log.id}`}>
                      Continuar entrenamiento →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </section>
  );
}
function AvailableBlock({ programId }: { programId: string }) {
  const query = useStudentBlocks(programId);
  const [selected, setSelected] = useState('');
  const block = query.data?.find((b) => b.id === selected) ?? query.data?.[0];
  if (query.isLoading) return <Skeleton />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!block)
    return (
      <EmptyState
        title="Sin bloques disponibles"
        description="Tu coach todavía está preparando este programa."
      />
    );
  return (
    <>
      <label className="field">
        Bloque
        <select value={block.id} onChange={(e) => setSelected(e.target.value)}>
          {query.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <AvailableWeek key={block.id} blockId={block.id} />
    </>
  );
}
function AvailableWeek({ blockId }: { blockId: string }) {
  const query = useStudentWeeks(blockId);
  const [selected, setSelected] = useState('');
  const week = query.data?.find((w) => w.id === selected) ?? query.data?.[0];
  if (query.isLoading) return <Skeleton />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!week) return <EmptyState title="Sin semanas disponibles" />;
  return (
    <>
      <label className="field">
        Semana
        <select value={week.id} onChange={(e) => setSelected(e.target.value)}>
          {query.data?.map((w) => (
            <option key={w.id} value={w.id}>
              Semana {w.number}
            </option>
          ))}
        </select>
      </label>
      <AvailableSession key={week.id} weekId={week.id} />
    </>
  );
}
function AvailableSession({ weekId }: { weekId: string }) {
  const query = useStudentSessions(weekId);
  const [selected, setSelected] = useState('');
  const session = query.data?.find((s) => s.id === selected) ?? query.data?.[0];
  if (query.isLoading) return <Skeleton />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!session) return <EmptyState title="Sin sesiones disponibles" />;
  return (
    <>
      <label className="field">
        Sesión
        <select
          value={session.id}
          onChange={(e) => setSelected(e.target.value)}
        >
          {query.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <SessionPreview key={session.id} sessionId={session.id} />
    </>
  );
}
function SessionPreview({ sessionId }: { sessionId: string }) {
  const query = useStudentSessionDetail(sessionId);
  const logs = useSessionWorkoutLogs(sessionId);
  const start = useStartWorkoutLog(sessionId);
  const navigate = useNavigate();
  const pending = logs.data?.find((log) => log.durationMinutes === null);
  return (
    <>
      {query.isLoading && <Skeleton />}
      {query.isError && <ErrorState retry={() => void query.refetch()} />}
      {query.data && (
        <>
          <ul className="nested-list">
            {query.data.exercises.map((item) => (
              <li key={item.id}>
                <strong>{item.exercise.name}</strong>
                <span className="muted">
                  {' '}
                  · {item.targetSets ?? '—'} series ·{' '}
                  {item.targetRepsMin ?? '—'}–{item.targetRepsMax ?? '—'} reps
                </span>
              </li>
            ))}
          </ul>
          {!query.data.exercises.length && (
            <EmptyState title="Sin ejercicios prescritos" />
          )}
        </>
      )}
      {logs.isError && <ErrorState retry={() => void logs.refetch()} />}
      <div className="dialog-actions">
        {pending ? (
          <Link
            className="button button--primary"
            to={`/workout-logs/${pending.id}`}
          >
            Continuar entrenamiento
          </Link>
        ) : (
          <button
            type="button"
            className="button--primary"
            disabled={!logs.isSuccess || !query.isSuccess || start.isPending}
            onClick={() =>
              void start
                .mutateAsync()
                .then((log) => navigate(`/workout-logs/${log.id}`))
                .catch(() => {})
            }
          >
            {start.isPending ? 'Iniciando…' : 'Iniciar entrenamiento'}
          </button>
        )}
        <Link to={`/student/sessions/${sessionId}`}>Ver sesión completa →</Link>
      </div>
      {start.isError && (
        <ErrorState message="No pudimos iniciar el entrenamiento. Inténtalo nuevamente." />
      )}
    </>
  );
}
