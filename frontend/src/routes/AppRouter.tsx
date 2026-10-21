import { lazy, Suspense } from 'react';
import { AppFailure, LoadingSpace } from '../components/ui/AppFailure';
import {
  AccountLinkPage,
  ForgotPasswordPage,
} from "../pages/AccountRecoveryPages";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { MainLayout } from "../layouts/MainLayout";
import { RequireAuth } from "../auth/RequireAuth";
const TrainingSessionPage = lazy(() => import('../pages/student-training/TrainingSessionPage').then(m => ({ default: m.TrainingSessionPage })));
const LibraryPage = lazy(() => import('../pages/blocks/LibraryPage').then(module => ({ default: module.LibraryPage })));
const LibraryEditorPage = lazy(() => import('../pages/blocks/LibraryEditorPage').then(module => ({ default: module.LibraryEditorPage })));

// Rutas de "Mis alumnos" protegidas por sesión + rol COACH (PROMPT 04,
// punto 16). Esto es solo una ayuda de UX: la autorización real (que el
// coach solo pueda ver SUS alumnos) se valida siempre en el backend
// (StudentsController/StudentsService), nunca acá — quien llame a la API
// directamente sin pasar por esta UI sigue bloqueado por esos guards.
const MessagesPage = lazy(() => import('../pages/coaching/MessagesPage').then((module) => ({ default: module.MessagesPage })));
const Calendar = lazy(() => import('../components/coaching/Planning').then((module) => ({ default: module.Calendar })));
const CompetitionsPage = lazy(() => import('../pages/coaching/CompetitionsPage').then((module) => ({ default: module.CompetitionsPage })));
const ProfilePage = lazy(() => import('../pages/coaching/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const HomePage = lazy(() => import('../pages/HomePage').then((module) => ({ default: module.HomePage })));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));
const LoginPage = lazy(() => import('../pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('../pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const StudentsListPage = lazy(() => import('../pages/students/StudentsListPage').then((module) => ({ default: module.StudentsListPage })));
const AthleteWorkspace = lazy(() => import('../pages/students/AthleteWorkspace').then((module) => ({ default: module.AthleteWorkspace })));
const ExercisesListPage = lazy(() => import('../pages/exercises/ExercisesListPage').then((module) => ({ default: module.ExercisesListPage })));
const ExerciseDetailPage = lazy(() => import('../pages/exercises/ExerciseDetailPage').then((module) => ({ default: module.ExerciseDetailPage })));
const ProgramsListPage = lazy(() => import('../pages/programs/ProgramsListPage').then((module) => ({ default: module.ProgramsListPage })));
const ProgramDetailPage = lazy(() => import('../pages/programs/ProgramDetailPage').then((module) => ({ default: module.ProgramDetailPage })));
const BlockDetailPage = lazy(() => import('../pages/blocks/BlockDetailPage').then((module) => ({ default: module.BlockDetailPage })));
const WeekDetailPage = lazy(() => import('../pages/weeks/WeekDetailPage').then((module) => ({ default: module.WeekDetailPage })));
const SessionDetailPage = lazy(() => import('../pages/sessions/SessionDetailPage').then((module) => ({ default: module.SessionDetailPage })));
const WorkoutLogPage = lazy(() => import('../pages/student-training/WorkoutLogPage').then((module) => ({ default: module.WorkoutLogPage })));
const HistoryPage = lazy(() => import('../pages/student-training/HistoryPage').then((module) => ({ default: module.HistoryPage })));
const DashboardPage = lazy(() => import('../pages/coach-dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const ImportExcelPage = lazy(() => import('../pages/imports/ImportExcelPage').then((module) => ({ default: module.ImportExcelPage })));
const StudentHomePage = lazy(() => import('../pages/student-training/StudentHomePage').then((module) => ({ default: module.StudentHomePage })));

const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <AppFailure />,
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      {
        path: "activate",
        element: <AccountLinkPage key="activate" mode="activate" />,
      },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      {
        path: "reset-password",
        element: <AccountLinkPage key="reset" mode="reset-password" />,
      },
      {
        element: <RequireAuth allowedRoles={["COACH"]} />,
        children: [
          { path: "students", element: <StudentsListPage /> },
          { path: "students/:id", element: <AthleteWorkspace /> },
          { path: "dashboard", element: <DashboardPage /> },
          {
            path: "dashboard/students/:studentId",
            element: <AthleteWorkspace statistics />,
          },
          { path: "exercises", element: <ExercisesListPage /> },
          { path: "exercises/:id", element: <ExerciseDetailPage /> },
          { path: "programs", element: <ProgramsListPage /> },
          { path: "programs/:id", element: <ProgramDetailPage /> },
          { path: "blocks", element: <LibraryPage /> },
          { path: "block-library/:id", element: <LibraryEditorPage /> },
          { path: "blocks/:id", element: <BlockDetailPage /> },
          { path: "weeks/:id", element: <WeekDetailPage /> },
          { path: "sessions/:id", element: <SessionDetailPage /> },
          { path: "imports/excel", element: <ImportExcelPage /> },
        ],
      },
      {
        element: <RequireAuth allowedRoles={["STUDENT"]} />,
        children: [
          { path: "home", element: <StudentHomePage /> },
          { path: "calendar", element: <Calendar /> },
          { path: "competitions", element: <CompetitionsPage /> },
          { path: "training", element: <StudentHomePage training /> },
          { path: "my-programs", element: <Navigate to="/training" replace /> },
          { path: "student/programs/:id", element: <Navigate to="/training" replace /> },
          { path: "student/blocks/:id", element: <Navigate to="/training" replace /> },
          { path: "student/weeks/:id", element: <Navigate to="/training" replace /> },
          { path: "student/sessions/:id", element: <TrainingSessionPage /> },
          { path: "workout-logs/:id", element: <WorkoutLogPage /> },
          { path: "history", element: <HistoryPage /> },
        ],
      },
      { element: <RequireAuth allowedRoles={["COACH", "STUDENT"]} />, children: [{ path: "training/sessions/:id", element: <TrainingSessionPage /> }, { path: "profile", element: <ProfilePage /> }, { path: "messages", element: <MessagesPage /> }] },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function AppRouter() {
  return <Suspense fallback={<LoadingSpace />}><RouterProvider router={router} /></Suspense>;
}
