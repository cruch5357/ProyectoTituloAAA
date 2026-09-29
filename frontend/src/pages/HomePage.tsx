import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { StudentHomePage } from './student-training/StudentHomePage';
import { Skeleton } from '../components/ui/Primitives';
export function HomePage() {
  const { status, user } = useAuth();
  if (status === 'loading') return <Skeleton label="Preparando tu espacio…" />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return user?.role === 'COACH' ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <StudentHomePage />
  );
}
