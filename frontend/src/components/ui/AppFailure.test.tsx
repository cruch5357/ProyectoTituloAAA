import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary, LoadingSpace } from './AppFailure';

describe('recuperación del arranque', () => {
  it('ofrece reintentar cuando una ruta no termina de descargar', async () => {
    vi.useFakeTimers();
    try {
      render(<LoadingSpace />);
      expect(screen.getByRole('status')).toHaveTextContent('Abriendo');
      await act(() => vi.advanceTimersByTimeAsync(12000));
      expect(screen.getByRole('button', { name: 'Volver a intentar' })).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it('presenta una recuperación si React falla al renderizar', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken(): never { throw new Error('render failed'); }
    try {
      render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
      expect(screen.getByRole('alert')).toHaveTextContent('No pudimos abrir tu espacio');
    } finally { log.mockRestore(); }
  });
});
