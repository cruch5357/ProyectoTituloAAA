import { AthletePlan, Calendar } from '../../components/coaching/Planning';
import { CompetitionsPage } from '../coaching/CompetitionsPage';
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
        <><Calendar studentId={id!} /><CompetitionsPage studentId={id!} /></>
      ) : selected === 'forms' ? (
        <Card>
          <EmptyState
            title="Sin formularios"
            description="Los formularios de seguimiento se incorporarán en una próxima etapa."
          />
        </Card>
      ) : (
        <>
          <AthletePlan studentId={id!} /><AthleteSummary id={id!} />
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

    </>
  );
}
