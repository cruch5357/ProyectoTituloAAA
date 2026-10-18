import { Component, useEffect, useState, type ReactNode } from 'react';

export function LoadingSpace() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(timer);
  }, []);
  return <div className="app-loading" role="status">
    <p>{slow ? 'La conexión está tardando. Comprueba tu acceso a la red.' : 'Abriendo tu espacio…'}</p>
    {slow && <button onClick={() => window.location.reload()}>Volver a intentar</button>}
  </div>;
}

export function AppFailure() {
  return <main className="app-loading" role="alert">
    <h1>No pudimos abrir tu espacio</h1>
    <p>Comprueba tu conexión e inténtalo nuevamente.</p>
    <button onClick={() => window.location.reload()}>Volver a intentar</button>
    <p><a href="/">Ir al inicio</a></p>
  </main>;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <AppFailure /> : this.props.children; }
}
