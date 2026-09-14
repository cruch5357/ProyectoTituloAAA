import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';

// Estructura de rutas mínima. Las rutas protegidas por rol (Coach/Alumno)
// se agregan cuando exista autenticación (ver docs/requirements.md, RF-01 a
// RF-04), envolviéndolas en un guard de ruta que redirige según el rol del
// usuario autenticado. La autorización real siempre se valida en el backend;
// el guard de ruta del frontend es solo una ayuda de UX.
const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
