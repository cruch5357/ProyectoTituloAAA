import { PersonalPerformance } from '../../components/ui/PersonalPerformance';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useStudent } from '../../api/students';
import { useStudentDashboard } from '../../api/dashboard';
import { StudentDetailPage } from './StudentDetailPage';
import { StudentDashboardPage } from '../coach-dashboard/StudentDashboardPage';
import { StudentStatusBadge } from './StudentStatusBadge';
import { AthleteProgramPanel } from './AthleteProgramPanel';
import {
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../components/ui/Primitives';
const tabs = [
  ['overview', 'Resumen'],
  ['program', 'Programa'],
  ['calendar', 'Calendario'],
  ['forms', 'Formularios'],
  ['statistics', 'Perfil Estadístico'],
] as const;
export function AthleteWorkspace({
  statistics = false,
}: {
  statistics?: boolean;
}) {
  const params = useParams();
  const id = params.id ?? params.studentId;
  const [search] = useSearchParams();
  const requestedTab = search.get('tab');
  const selected = statistics
    ? 'statistics'
    : tabs.some(([key]) => key === requestedTab)
      ? requestedTab
      : 'overview';
  const query = useStudent(id);
  if (query.isLoading) return <Skeleton label="Cargando alumno…" />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!query.data) return null;
  return (
    <section>
      <p>
        <Link to="/students">← Mis alumnos</Link>
      </p>
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace del atleta</p>
          <h1>{query.data.name}</h1>
          <p className="muted">{query.data.email}</p>
        </div>
        <StudentStatusBadge isActive={query.data.isActive} />
      </header>
      <nav className="tabs" aria-label="Secciones del atleta">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            aria-current={selected === key ? 'page' : undefined}
            to={
              key === 'statistics'
                ? `/dashboard/students/${id}`
                : `/students/${id}?tab=${key}`
            }
          >
            {label}
          </Link>
        ))}
      </nav>
      {selected === 'statistics' ? (
        <StudentDashboardPage embedded studentIdOverride={id} />
      ) : selected === 'program' ? (
        <AthleteProgramPanel key={id} studentId={id!} />
      ) : selected === 'calendar' ? (
        <AthleteCalendar id={id!} />
      ) : selected === 'forms' ? (
        <Card>
          <EmptyState
            title="Sin formularios"
            description="No hay formularios disponibles actualmente."
          />
        </Card>
      ) : (
        <>
          <AthleteSummary id={id!} />
          <Card>
            <StudentDetailPage embedded />
          </Card>
        </>
      )}
    </section>
  );
}
function AthleteSummary({ id }: { id: string }) {
  const query = useStudentDashboard(id, {});
  if (query.isLoading) return <Skeleton />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!query.data) return null;
  return (
    <>
      <PersonalPerformance
        summary={query.data.summary}
        recent={query.data.recentPerformance}
        registered={query.data.workoutsRegistered}
      />
      <Card>
        <h2>Programa activo</h2>
        <p className="muted">
          Las asignaciones se consultan desde cada programa.
        </p>
        <Link to={`/students/${id}?tab=program`}>Ir a programación →</Link>
      </Card>
    </>
  );
}
function AthleteCalendar({ id }: { id: string }) {
  const query = useStudentDashboard(id, {});
  return (
    <Card>
      <h2>Calendario</h2>
      <EmptyState
        title="Sin fechas de planificación"
        description="Los bloques y semanas aún no tienen fechas programadas. Aquí aparecerá el calendario cuando estén disponibles."
      />
      {query.isLoading && <Skeleton />}
      {query.isError && <ErrorState retry={() => void query.refetch()} />}
      {query.data?.summary.lastWorkoutAt && (
        <p>
          Última actividad registrada:{' '}
          <time dateTime={query.data.summary.lastWorkoutAt}>
            {new Date(query.data.summary.lastWorkoutAt).toLocaleDateString()}
          </time>
        </p>
      )}
    </Card>
  );
}
