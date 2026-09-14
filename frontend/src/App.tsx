import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouter } from './routes/AppRouter';

// Estado de servidor (datos remotos) gestionado con TanStack Query, según
// docs/architecture.md. Todavía no hay ninguna query real: se agregan junto
// con cada funcionalidad de negocio en los prompts siguientes.
const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  );
}

export default App;
