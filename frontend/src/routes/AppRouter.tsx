import { lazy } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { StudentsListPage } from '../pages/students/StudentsListPage';
import { AthleteWorkspace } from '../pages/students/AthleteWorkspace';
import { ExercisesListPage } from '../pages/exercises/ExercisesListPage';
import { ExerciseDetailPage } from '../pages/exercises/ExerciseDetailPage';
import { ProgramsListPage } from '../pages/programs/ProgramsListPage';
import { ProgramDetailPage } from '../pages/programs/ProgramDetailPage';
import { BlockDetailPage } from '../pages/blocks/BlockDetailPage';
import { WeekDetailPage } from '../pages/weeks/WeekDetailPage';
import { SessionDetailPage } from '../pages/sessions/SessionDetailPage';
import { MyAssignedProgramsPage } from '../pages/programs/MyAssignedProgramsPage';
import { StudentProgramPage } from '../pages/student-training/StudentProgramPage';
import { StudentBlockPage } from '../pages/student-training/StudentBlockPage';
import { StudentWeekPage } from '../pages/student-training/StudentWeekPage';
import { StudentSessionPage } from '../pages/student-training/StudentSessionPage';
import { WorkoutLogPage } from '../pages/student-training/WorkoutLogPage';
import { HistoryPage } from '../pages/student-training/HistoryPage';
import { DashboardPage } from '../pages/coach-dashboard/DashboardPage';
import { ImportExcelPage } from '../pages/imports/ImportExcelPage';
import { StudentHomePage } from '../pages/student-training/StudentHomePage';
import { RequireAuth } from '../auth/RequireAuth';

// Code-splitting por ruta (PROMPT 20, rendimiento — carga inicial/bundle).
// Antes, las ~19 páginas de acá abajo se importaban de forma estática y
// terminaban TODAS en el mismo chunk principal (incluido en la carga
// inicial de cualquier usuario, sin importar su rol ni qué página vaya a
// visitar realmente). Se mantienen eager solo Home/Login/Register/NotFound
// (arriba): son las únicas que se necesitan antes de que se resuelva la
// sesión, para cualquier visitante. El resto ya está agrupado por rol en
// las dos ramas de `RequireAuth` de más abajo, así que un COACH nunca
// descarga el código de las páginas de ALUMNO y viceversa — Vite genera un
// chunk separado por cada import() dinámico automáticamente, sin
// configuración adicional.
const StudentsListPage = lazy(() =>
  import('../pages/students/StudentsListPage').then((m) => ({
    default: m.StudentsListPage,
  })),
);
const StudentDetailPage = lazy(() =>
  import('../pages/students/StudentDetailPage').then((m) => ({
    default: m.StudentDetailPage,
  })),
);
const ExercisesListPage = lazy(() =>
  import('../pages/exercises/ExercisesListPage').then((m) => ({
    default: m.ExercisesListPage,
  })),
);
const ExerciseDetailPage = lazy(() =>
  import('../pages/exercises/ExerciseDetailPage').then((m) => ({
    default: m.ExerciseDetailPage,
  })),
);
const ProgramsListPage = lazy(() =>
  import('../pages/programs/ProgramsListPage').then((m) => ({
    default: m.ProgramsListPage,
  })),
);
const ProgramDetailPage = lazy(() =>
  import('../pages/programs/ProgramDetailPage').then((m) => ({
    default: m.ProgramDetailPage,
  })),
);
const BlockDetailPage = lazy(() =>
  import('../pages/blocks/BlockDetailPage').then((m) => ({
    default: m.BlockDetailPage,
  })),
);
const WeekDetailPage = lazy(() =>
  import('../pages/weeks/WeekDetailPage').then((m) => ({
    default: m.WeekDetailPage,
  })),
);
const SessionDetailPage = lazy(() =>
  import('../pages/sessions/SessionDetailPage').then((m) => ({
    default: m.SessionDetailPage,
  })),
);
const MyAssignedProgramsPage = lazy(() =>
  import('../pages/programs/MyAssignedProgramsPage').then((m) => ({
    default: m.MyAssignedProgramsPage,
  })),
);
const StudentProgramPage = lazy(() =>
  import('../pages/student-training/StudentProgramPage').then((m) => ({
    default: m.StudentProgramPage,
  })),
);
const StudentBlockPage = lazy(() =>
  import('../pages/student-training/StudentBlockPage').then((m) => ({
    default: m.StudentBlockPage,
  })),
);
const StudentWeekPage = lazy(() =>
  import('../pages/student-training/StudentWeekPage').then((m) => ({
    default: m.StudentWeekPage,
  })),
);
const StudentSessionPage = lazy(() =>
  import('../pages/student-training/StudentSessionPage').then((m) => ({
    default: m.StudentSessionPage,
  })),
);
const WorkoutLogPage = lazy(() =>
  import('../pages/student-training/WorkoutLogPage').then((m) => ({
    default: m.WorkoutLogPage,
  })),
);
const HistoryPage = lazy(() =>
  import('../pages/student-training/HistoryPage').then((m) => ({
    default: m.HistoryPage,
  })),
);
const DashboardPage = lazy(() =>
  import('../pages/coach-dashboard/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
);
const ImportExcelPage = lazy(() =>
  import('../pages/imports/ImportExcelPage').then((m) => ({
    default: m.ImportExcelPage,
  })),
);
const StudentDashboardPage = lazy(() =>
  import('../pages/coach-dashboard/StudentDashboardPage').then((m) => ({
    default: m.StudentDashboardPage,
  })),
);

// Rutas de "Mis alumnos" protegidas por sesión + rol COACH (PROMPT 04,
// punto 16). Esto es solo una ayuda de UX: la autorización real (que el
// coach solo pueda ver SUS alumnos) se valida siempre en el backend
// (StudentsController/StudentsService), nunca acá — quien llame a la API
// directamente sin pasar por esta UI sigue bloqueado por esos guards.
const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      {
        element: <RequireAuth allowedRoles={['COACH']} />,
        children: [
          { path: 'students', element: <StudentsListPage /> },
          { path: 'students/:id', element: <AthleteWorkspace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          {
            path: 'dashboard/students/:studentId',
            element: <AthleteWorkspace statistics />,
          },
          { path: 'exercises', element: <ExercisesListPage /> },
          { path: 'exercises/:id', element: <ExerciseDetailPage /> },
          { path: 'programs', element: <ProgramsListPage /> },
          { path: 'programs/:id', element: <ProgramDetailPage /> },
          { path: 'blocks/:id', element: <BlockDetailPage /> },
          { path: 'weeks/:id', element: <WeekDetailPage /> },
          { path: 'sessions/:id', element: <SessionDetailPage /> },
          { path: 'imports/excel', element: <ImportExcelPage /> },
        ],
      },
      {
        element: <RequireAuth allowedRoles={['STUDENT']} />,
        children: [
          { path: 'training', element: <StudentHomePage training /> },
          { path: 'my-programs', element: <MyAssignedProgramsPage /> },
          { path: 'student/programs/:id', element: <StudentProgramPage /> },
          { path: 'student/blocks/:id', element: <StudentBlockPage /> },
          { path: 'student/weeks/:id', element: <StudentWeekPage /> },
          { path: 'student/sessions/:id', element: <StudentSessionPage /> },
          { path: 'workout-logs/:id', element: <WorkoutLogPage /> },
          { path: 'history', element: <HistoryPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
