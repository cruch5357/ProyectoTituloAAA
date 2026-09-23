import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { StudentsListPage } from '../pages/students/StudentsListPage';
import { StudentDetailPage } from '../pages/students/StudentDetailPage';
import { RequireAuth } from '../auth/RequireAuth';

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
          { path: 'students/:id', element: <StudentDetailPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
