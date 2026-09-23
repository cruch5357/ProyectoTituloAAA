import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

// Envoltorio mínimo compartido por las pruebas de páginas/componentes que
// dependen de TanStack Query (caché de datos remotos) y React Router
// (Link/useParams) — ambas ya son parte de la arquitectura del frontend
// (docs/architecture.md, sección 3), no algo agregado solo para testear.
//
// Un QueryClient nuevo por render evita que la caché de una prueba
// contamine la siguiente (equivalente a "no compartir estado entre tests").
export function renderWithProviders(
  ui: ReactElement,
  { route = '/' }: { route?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// Variante para páginas que dependen de un parámetro de ruta (`useParams`),
// como ExerciseDetailPage (`/exercises/:id`).
export function renderWithRoute(
  ui: ReactElement,
  { path, route }: { path: string; route: string },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
