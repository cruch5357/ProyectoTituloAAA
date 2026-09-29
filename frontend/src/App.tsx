import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import { AppRouter } from './routes/AppRouter';
import { ThemeProvider } from './theme/ThemeProvider';

// Estado de servidor (datos remotos) gestionado con TanStack Query, según
// docs/architecture.md. Las primeras queries reales (alumnos) se agregan en
// PROMPT 04 — ver src/api/students.ts.
//
// `staleTime` (PROMPT 20, rendimiento): sin configurar, el valor por
// defecto de TanStack Query es 0, es decir CADA query se considera
// "vieja" apenas llega y se vuelve a pedir al servidor en cualquier
// remount o al recuperar el foco de la ventana — duplicando requests
// idénticos en navegación normal (ida y vuelta entre lista/detalle,
// cambiar de pestaña y volver). 30s es un margen conservador: cualquier
// mutación (crear/editar/eliminar) sigue invalidando su query explícitamente
// (ver los hooks en src/api/*.ts, todos con `invalidateQueries` en
// `onSuccess`), así que el usuario nunca ve datos desactualizados después de
// su propia acción — este valor solo evita refetchs redundantes de datos que
// ya llegaron hace segundos y nadie cambió.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <AppRouter />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
