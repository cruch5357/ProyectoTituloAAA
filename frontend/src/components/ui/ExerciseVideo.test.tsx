import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseVideo } from './ExerciseVideo';
import { parseExerciseVideo } from '../../lib/exerciseVideo';
const { events, destroy } = vi.hoisted(() => ({
  events: {} as {
    onReady?: () => void;
    onError?: (event: { data: number }) => void;
  },
  destroy: vi.fn(),
}));
vi.mock('../../lib/youtubePlayer', () => ({
  loadYoutubePlayer: async () => ({
    Player: class {
      constructor(_iframe: unknown, options: { events: typeof events }) {
        Object.assign(events, options.events);
      }
      destroy = destroy;
    },
  }),
}));
describe('Videos de ejercicios', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=unlisted',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ])('normaliza público/no listado sin credenciales: %s', (url) => {
    expect(parseExerciseVideo(url)?.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://youtube.com@evil.test/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=invalid',
    '<iframe>',
    'https://example.com/movie',
  ])('rechaza %s', (url) => expect(parseExerciseVideo(url)).toBeNull());
  it('explica sin video y URL inválida', () => {
    const view = render(<ExerciseVideo name="Sentadilla" />);
    expect(
      screen.getByText('Este ejercicio no tiene video demostrativo.'),
    ).toBeInTheDocument();
    view.rerender(
      <ExerciseVideo name="Sentadilla" videoUrl="javascript:alert(1)" />,
    );
    expect(
      screen.getByText('El video configurado no es válido.'),
    ).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('solo carga al abrir, sin autoplay, y muestra errores de embedding; cerrar detiene el player', async () => {
    render(
      <ExerciseVideo
        name="Sentadilla"
        videoUrl="https://youtu.be/dQw4w9WgXcQ"
      />,
    );
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button')).toHaveClass('button--secondary');
    await userEvent.click(screen.getByRole('button', { name: 'Ver técnica' }));
    const iframe = screen.getByTitle('Video demostrativo: Sentadilla');
    expect(iframe).toHaveAttribute('loading', 'lazy');
    expect(iframe.getAttribute('src')).toContain('autoplay=0');
    expect(screen.getByRole('status')).toHaveTextContent('Cargando video');
    act(() => events.onReady?.());
    expect(screen.queryByRole('status')).toBeNull();
    act(() => events.onError?.({ data: 5 }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo reproducir este video dentro de la aplicación.',
    );
    expect(
      screen.getByRole('link', { name: /Ver en YouTube/ }),
    ).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(iframe).not.toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Ocultar video' }),
    );
    expect(document.querySelector('iframe')).toBeNull();
    expect(destroy).toHaveBeenCalled();
  });
  it('si el dueño no permite incrustarlo (error 150) lo explica y ofrece verlo en YouTube', async () => {
    render(
      <ExerciseVideo
        name="Pantorrillas"
        videoUrl="https://www.youtube.com/shorts/rsesiGrB1hg"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ver técnica' }));
    act(() => events.onError?.({ data: 150 }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'su dueño no permite verlo en otras páginas',
    );
    const link = screen.getByRole('link', { name: /Ver en YouTube/ });
    expect(link).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=rsesiGrB1hg',
    );
    expect(link).toHaveAttribute('target', '_blank');
  });
});
