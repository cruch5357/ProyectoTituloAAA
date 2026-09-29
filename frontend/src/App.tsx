import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import { AppRouter } from './routes/AppRouter';
import { ThemeProvider } from './theme/ThemeProvider';

// Estado de servidor (datos remotos) gestionado con TanStack Query, según
// docs/architecture.md. Las primeras queries reales (alumnos) se agregan en
// PROMPT 04 — ver src/api/students.ts.
const queryClient = new QueryClient();

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
